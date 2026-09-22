import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { createI18nProxy } from "../proxy.js";

describe("internationalization proxy", () => {
  it("permanently redirects an unprefixed public path to English regardless of language negotiation", () => {
    const proxy = createI18nProxy({ urlMappingStrategy: "redirect" });

    const response = proxy(
      new NextRequest("http://localhost/vehicles", {
        headers: { "accept-language": "de" },
      })
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "http://localhost/en/vehicles"
    );
  });

  it("redirects a configured but unlaunched locale to the launched English route", () => {
    const proxy = createI18nProxy({
      locales: ["en"],
      urlMappingStrategy: "redirect",
    });

    const response = proxy(new NextRequest("http://localhost/es/vehicles"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "http://localhost/en/vehicles"
    );
  });
});
