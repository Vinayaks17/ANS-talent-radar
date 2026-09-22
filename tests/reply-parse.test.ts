import { describe, it, expect } from "vitest";
import { extractReplyText, detectAutomated, threadTokenFromAddresses, htmlToText } from "@/lib/email/parse-reply";

describe("extractReplyText", () => {
  it("strips quoted history and a signature", () => {
    const raw = `Thanks for reaching out. Not now, bonus pays in Feb — happy to reconnect in March.\n\nBest regards,\nBryan Boling\nSenior Freight Broker\n\nOn Tue, Sep 16, 2026 at 9:12 AM Sushant <sushant+t_abc12345@talent.example.com> wrote:\n> Hi Bryan,\n> quick question`;
    expect(extractReplyText(raw)).toBe("Thanks for reaching out. Not now, bonus pays in Feb — happy to reconnect in March.");
  });
  it("keeps a reply that is only a signature-like word", () => {
    expect(extractReplyText("Thanks\n")).toBe("Thanks");
  });
  it("handles Outlook style headers", () => {
    const raw = "Sure, call me Friday.\r\n\r\n________________________________\r\nFrom: Sushant\r\nSent: Monday";
    expect(extractReplyText(raw)).toBe("Sure, call me Friday.");
  });
});

describe("detectAutomated", () => {
  it("flags out-of-office", () => {
    expect(detectAutomated({ headers: { "auto-submitted": "auto-replied" }, from: "a@b.com", subject: "Automatic reply: Quick question", text: "" })).toBe("AUTO_REPLY");
    expect(detectAutomated({ headers: {}, from: "a@b.com", subject: "Re: Quick question", text: "I am out of the office until Monday with limited access to email." })).toBe("AUTO_REPLY");
  });
  it("flags bounces", () => {
    expect(detectAutomated({ headers: {}, from: "MAILER-DAEMON@mx.example.com", subject: "Undeliverable: Quick question", text: "" })).toBe("BOUNCE");
  });
  it("passes real replies", () => {
    expect(detectAutomated({ headers: {}, from: "bryan@abc.com", subject: "Re: Quick question", text: "Not right now, maybe March." })).toBe("NONE");
  });
});

describe("threadTokenFromAddresses", () => {
  it("extracts the plus token", () => {
    expect(threadTokenFromAddresses(["Sushant <sushant+t_k9f3h2a8b7c6@talent.example.com>".toLowerCase().replace(/.*<|>.*/g, "")])).toBe("k9f3h2a8b7c6");
    expect(threadTokenFromAddresses(["recruiting@talent.example.com"])).toBeNull();
  });
});

describe("htmlToText", () => {
  it("converts simple html and drops blockquotes", () => {
    expect(htmlToText("<div>Hi<br>there</div><blockquote>old</blockquote>")).toBe("Hi\nthere\n\n> quoted");
  });
});
