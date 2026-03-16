/**
 * Gemini Live API WebSocket Proxy Handler
 *
 * This module handles WebSocket connections from frontend clients
 * and proxies them to the Gemini Live API using Vertex AI authentication.
 */

import {
  type FunctionDeclaration,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Part,
  type Session,
  Type,
} from '@google/genai';
import type { WebSocket } from 'ws';
import type {
  ClientContentMessage,
  ClientMessage,
  GeminiConfig,
  RealtimeInputMessage,
  SetupMessage,
  ToolResponseMessage,
} from './types.js';


/**
 * Send a JSON message to the client WebSocket
 */
function sendToClient(ws: WebSocket, type: string, data?: unknown): void {
  if (ws.readyState === 1) {
    // WebSocket.OPEN
    ws.send(JSON.stringify({ type, data }));
  }
}

/**
 * Send an error message to the client
 */
function sendError(ws: WebSocket, error: string): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'error', error }));
  }
}

/**
 * Handle a WebSocket connection from a frontend client
 */
export async function handleProxyConnection(
  clientWs: WebSocket,
  geminiConfig: GeminiConfig
): Promise<void> {
  let geminiSession: Session | null = null;
  let isSetupComplete = false;

  console.log('[Proxy] New client connection');

  // Initialize GoogleGenAI with Vertex AI authentication
  const ai = new GoogleGenAI({
    vertexai: true,
    project: geminiConfig.projectId,
    location: geminiConfig.location,
    googleAuthOptions: {
      keyFilename: geminiConfig.keyFilePath,
    },
  });

  console.log('[Proxy] GoogleGenAI initialized with Vertex AI');

  /**
   * Handle setup message - create Gemini Live session
   */
  async function handleSetup(message: SetupMessage): Promise<void> {
    if (geminiSession) {
      console.log('[Proxy] Session already exists, closing old one');
      geminiSession.close();
    }

    const { config } = message;
    const fullModel = `projects/${geminiConfig.projectId}/locations/${geminiConfig.location}/publishers/google/models/${geminiConfig.modelId}`;

    console.log(`[Proxy] Creating Gemini session with model: ${fullModel}`);

    const configWithTools: LiveConnectConfig = {
      ...config,
    };

    configWithTools.thinkingConfig = {
      // includeThoughts: true,
      // thinkingLevel: ThinkingLevel.HIGH
    }

    console.log('[Proxy] Gemini config prepared', configWithTools);

    // System Prompt for GemiNav AI Persona (Injected only if no instructions)
    const personaInstruction = "You are GemiNav AI, an AI assistant. You help people navigate the web and understand what is on their screen. You can see their screen or webcam if they allow it. Always confirm actions verbally. If the user asks you to look at something, use your vision tools.";

    if (!configWithTools.systemInstruction) {
      configWithTools.systemInstruction = {
        role: 'system',
        parts: [{ text: personaInstruction }]
      };
    }



    try {
      geminiSession = await ai.live.connect({
        model: fullModel,
        config: configWithTools,
        callbacks: {
          onopen: () => {
            console.log('[Proxy] Gemini session opened');
            sendToClient(clientWs, 'open');
          },
          onmessage: (message: LiveServerMessage) => {
            handleGeminiMessage(message);
          },
          onerror: (e: ErrorEvent) => {
            console.error('[Proxy] Gemini error:', e.message);
            sendError(clientWs, e.message);
          },
          onclose: (e: CloseEvent) => {
            console.log('[Proxy] Gemini session closed:', e.reason);
            sendToClient(clientWs, 'close', { reason: e.reason });
          },
        },
      });

      isSetupComplete = true;
      console.log('[Proxy] Gemini session created successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Proxy] Failed to create Gemini session:', errorMessage);
      sendError(clientWs, `Failed to connect to Gemini: ${errorMessage}`);
    }
  }

  /**
   * Handle messages from Gemini and forward to client
   */
  function handleGeminiMessage(message: LiveServerMessage): void {
    // Setup complete
    if (message.setupComplete) {
      console.log('[Proxy] Setup complete');
      sendToClient(clientWs, 'setupComplete');
      return;
    }

    // Tool call - execute locally and respond
    if (message.toolCall) {
      console.log('[Proxy] Tool call received:', message.toolCall);

      const functionCalls = message.toolCall.functionCalls || [];
      const functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }> = [];

      for (const fc of functionCalls) {
        const { name, args, id } = fc;

        // Forward generic tools to client
        sendToClient(clientWs, 'toolCall', message.toolCall);
      }

      // Send tool responses back to Gemini
      if (functionResponses.length > 0 && geminiSession) {
        console.log('[Proxy] Sending tool responses to Gemini:', functionResponses);
        geminiSession.sendToolResponse({
          functionResponses,
        });
      }
      return;
    }

    // Tool call cancellation
    if (message.toolCallCancellation) {
      console.log('[Proxy] Tool call cancellation');
      sendToClient(clientWs, 'toolCallCancellation', message.toolCallCancellation);
      return;
    }

    // Server content
    if (message.serverContent) {
      const { serverContent } = message;

      // Interrupted
      if ('interrupted' in serverContent && serverContent.interrupted) {
        console.log('[Proxy] Interrupted');
        sendToClient(clientWs, 'interrupted');
        return;
      }

      // Turn complete
      if ('turnComplete' in serverContent && serverContent.turnComplete) {
        console.log('[Proxy] Turn complete');
        sendToClient(clientWs, 'turnComplete');
      }

      // Model turn with parts
      if ('modelTurn' in serverContent && serverContent.modelTurn) {
        const parts: Part[] = serverContent.modelTurn.parts || [];

        // Extract audio parts
        const audioParts = parts.filter(
          (p) => p.inlineData && p.inlineData.mimeType?.startsWith('audio/pcm')
        );

        // Send audio parts
        for (const audioPart of audioParts) {
          if (audioPart.inlineData?.data) {
            sendToClient(clientWs, 'audio', audioPart.inlineData.data);
          }
        }

        // Send non-audio content
        const otherParts = parts.filter(
          (p) => !p.inlineData || !p.inlineData.mimeType?.startsWith('audio/pcm')
        );

        if (otherParts.length > 0) {
          sendToClient(clientWs, 'content', {
            modelTurn: { parts: otherParts },
          });
        }
      }
    }
  }

  /**
   * Handle realtime input (audio/video)
   */
  function handleRealtimeInput(message: RealtimeInputMessage): void {
    if (!geminiSession || !isSetupComplete) {
      console.warn('[Proxy] Session not ready, dropping realtime input');
      return;
    }

    for (const chunk of message.chunks) {
      geminiSession.sendRealtimeInput({ media: chunk });
    }
  }

  /**
   * Handle client content (text)
   */
  function handleClientContent(message: ClientContentMessage): void {
    if (!geminiSession || !isSetupComplete) {
      console.warn('[Proxy] Session not ready, dropping client content');
      return;
    }

    geminiSession.sendClientContent({
      turns: message.turns,
      turnComplete: message.turnComplete,
    });
  }

  /**
   * Handle tool response
   */
  function handleToolResponse(message: ToolResponseMessage): void {
    if (!geminiSession || !isSetupComplete) {
      console.warn('[Proxy] Session not ready, dropping tool response');
      return;
    }

    geminiSession.sendToolResponse({
      functionResponses: message.functionResponses,
    });
  }

  // Handle messages from client
  clientWs.on('message', async (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'setup':
          await handleSetup(message);
          break;
        case 'realtimeInput':
          handleRealtimeInput(message);
          break;
        case 'clientContent':
          handleClientContent(message);
          break;
        case 'toolResponse':
          handleToolResponse(message);
          break;
        default:
          console.warn('[Proxy] Unknown message type:', (message as any).type);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Proxy] Error processing message:', errorMessage);
      sendError(clientWs, errorMessage);
    }
  });

  // Handle client disconnect
  clientWs.on('close', (code: number, reason: Buffer) => {
    console.log(`[Proxy] Client disconnected: ${code} ${reason.toString()}`);
    if (geminiSession) {
      geminiSession.close();
      geminiSession = null;
    }
  });

  // Handle client error
  clientWs.on('error', (error: Error) => {
    console.error('[Proxy] Client WebSocket error:', error.message);
    if (geminiSession) {
      geminiSession.close();
      geminiSession = null;
    }
  });
}
