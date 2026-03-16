import { useCallback, useEffect, useState } from "react";
import Select from "react-select";

/**
 * localStorage key shared with ControlTray for reading the user's target language.
 * Exported so other components can read it without duplicating the string.
 */
export const TRANSLATOR_LANG_KEY = "translator_target_language";

const languageOptions = [
    { value: "English", label: "English" },
    { value: "Spanish", label: "Spanish" },
    { value: "French", label: "French" },
    { value: "German", label: "German" },
    { value: "Italian", label: "Italian" },
    { value: "Portuguese", label: "Portuguese" },
    { value: "Polish", label: "Polish" },
    { value: "Dutch", label: "Dutch" },
    { value: "Ukrainian", label: "Ukrainian" },
    { value: "Russian", label: "Russian" },
    { value: "Japanese", label: "Japanese" },
    { value: "Korean", label: "Korean" },
    { value: "Chinese", label: "Chinese" },
    { value: "Arabic", label: "Arabic" },
    { value: "Hindi", label: "Hindi" },
    { value: "Turkish", label: "Turkish" },
    { value: "Vietnamese", label: "Vietnamese" },
    { value: "Thai", label: "Thai" },
    { value: "Swedish", label: "Swedish" },
    { value: "Czech", label: "Czech" },
];

/** Map browser locale codes (e.g. "pl", "en-US") to our option labels. */
function detectDefaultLanguage(): string {
    const browserLang = navigator.language?.split("-")[0]?.toLowerCase() ?? "en";
    const map: Record<string, string> = {
        en: "English", es: "Spanish", fr: "French", de: "German",
        it: "Italian", pt: "Portuguese", pl: "Polish", nl: "Dutch",
        uk: "Ukrainian", ru: "Russian", ja: "Japanese", ko: "Korean",
        zh: "Chinese", ar: "Arabic", hi: "Hindi", tr: "Turkish",
        vi: "Vietnamese", th: "Thai", sv: "Swedish", cs: "Czech",
    };
    return map[browserLang] ?? "English";
}

export default function LanguageSelector() {
    const [selectedOption, setSelectedOption] = useState<{
        value: string;
        label: string;
    } | null>(null);

    // On mount: read localStorage, or fall back to browser language
    useEffect(() => {
        // Load initial state from LocalStorage
        const stored = localStorage.getItem(TRANSLATOR_LANG_KEY);
        let lang: string;
        if (stored) {
            lang = stored;
        } else {
            // Default to first option (e.g., English) if no previous setting
            lang = detectDefaultLanguage(); // Use detected language as default
            localStorage.setItem(TRANSLATOR_LANG_KEY, lang);
        }
        setSelectedOption({ value: lang, label: lang });
    }, []);

    const handleChange = useCallback(
        (option: { value: string; label: string } | null) => {
            if (option) {
                setSelectedOption(option);
                localStorage.setItem(TRANSLATOR_LANG_KEY, option.value);
            }
        },
        []
    );

    return (
        <div className="select-group">
            <label htmlFor="language-selector">EXPLAIN Target Language</label>
            <Select
                id="language-selector"
                className="react-select"
                classNamePrefix="react-select"
                styles={{
                    control: (baseStyles) => ({
                        ...baseStyles,
                        background: "var(--Neutral-15)",
                        color: "var(--Neutral-90)",
                        minHeight: "33px",
                        maxHeight: "33px",
                        border: 0,
                    }),
                    option: (styles, { isFocused, isSelected }) => ({
                        ...styles,
                        backgroundColor: isFocused
                            ? "var(--Neutral-30)"
                            : isSelected
                                ? "var(--Neutral-20)"
                                : undefined,
                    }),
                }}
                value={selectedOption}
                options={languageOptions}
                onChange={handleChange}
            />
        </div>
    );
}
