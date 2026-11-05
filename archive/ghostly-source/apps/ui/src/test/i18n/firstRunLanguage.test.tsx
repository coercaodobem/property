import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "../../contexts/SettingsContext";
import { useI18n } from "../../contexts/I18nContext";
import { browserLanguage, loadSettings } from "../../lib/settings";
import { renderApp } from "../render";

// covers: app.i18n

/** The browser's languages, as `navigator.languages` gives them. */
const browserSpeaks = (...languages: string[]) => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "");
};

function Title() {
  const { t } = useI18n();
  const { updateLanguage } = useSettings();
  return <><h1>{t("settings.title")}</h1><button onClick={() => updateLanguage("en")}>English</button><button onClick={() => updateLanguage("pt")}>Português (Brasil)</button></>;
}

afterEach(() => vi.restoreAllMocks());

describe("a new profile's language", () => {
  it("defaults to English regardless of the browser language", () => {
    expect(browserLanguage(["pt-BR", "en-US"])).toBe("en");
    expect(browserLanguage(["de-DE", "fr-CA", "en"])).toBe("en");
    expect(browserLanguage(["zh-TW", "ja", "ar-EG"])).toBe("en");
  });

  it("stays English when the browser speaks none of the app's languages", () => {
    expect(browserLanguage(["de-DE", "nl"])).toBe("en");
    expect(browserLanguage([])).toBe("en");
  });

  it("opens in English on the first run even when the device is set to Brazilian Portuguese", () => {
    browserSpeaks("pt-BR", "en");
    renderApp(<Title />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
    expect(document.documentElement.lang).toBe("en");
    expect(JSON.parse(localStorage.getItem("ghostly_app_settings")!).language).toBe("en");
  });

  it("lets a person explicitly choose Brazilian Portuguese", async () => {
    browserSpeaks("en-US");
    const { user } = renderApp(<Title />);
    await user.click(screen.getByRole("button", { name: "Português (Brasil)" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ajustes");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(JSON.parse(localStorage.getItem("ghostly_app_settings")!).language).toBe("pt");
  });

  it("the language setting still wins, whatever the browser speaks", async () => {
    browserSpeaks("fr-FR");
    localStorage.setItem("ghostly_app_settings", JSON.stringify({ language: "fr" }));
    const { user, unmount } = renderApp(<Title />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Réglages");
    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
    unmount();
    // A reload: the profile keeps its own language.
    expect(loadSettings().language).toBe("en");
    renderApp(<Title />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Settings");
  });

  it("a profile that already has settings is not moved to the browser's language", () => {
    browserSpeaks("es-ES");
    localStorage.setItem("ghostly_app_settings", JSON.stringify({ language: "ja" }));
    expect(loadSettings().language).toBe("ja");
    // Settings from before the language was saved read as English, as they did.
    localStorage.setItem("ghostly_app_settings", JSON.stringify({ colorScheme: "light" }));
    expect(loadSettings().language).toBe("en");
  });
});
