/** Messages sent between extension contexts (e.g. onboarding tab → side panel). */
export const ExtensionMessages = {
    MIC_PERMISSION_GRANTED: "MIC_PERMISSION_GRANTED",
} as const;

export type ExtensionMessage = {
    type: (typeof ExtensionMessages)[keyof typeof ExtensionMessages];
};
