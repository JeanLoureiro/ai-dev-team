import { describe, expect, it } from "vitest";
import { formatDuration, repeat } from "../src/utils";

describe("formatDuration", () => {
  describe("milliseconds range (< 1 second)", () => {
    it("formats 0ms", () => {
      expect(formatDuration(0)).toBe("0ms");
    });

    it("formats 1ms", () => {
      expect(formatDuration(1)).toBe("1ms");
    });

    it("formats 250ms", () => {
      expect(formatDuration(250)).toBe("250ms");
    });

    it("formats 500ms", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("formats 999ms", () => {
      expect(formatDuration(999)).toBe("999ms");
    });
  });

  describe("seconds range (>= 1 second, < 1 minute)", () => {
    it("formats exactly 1 second", () => {
      expect(formatDuration(1000)).toBe("1s");
    });

    it("formats 12 seconds", () => {
      expect(formatDuration(12000)).toBe("12s");
    });

    it("formats 30 seconds", () => {
      expect(formatDuration(30000)).toBe("30s");
    });

    it("formats 59 seconds", () => {
      expect(formatDuration(59000)).toBe("59s");
    });

    it("formats 59.999 seconds", () => {
      expect(formatDuration(59999)).toBe("59s");
    });
  });

  describe("minutes range (>= 1 minute, < 1 hour)", () => {
    it("formats exactly 1 minute", () => {
      expect(formatDuration(60000)).toBe("1m 0s");
    });

    it("formats 4 minutes 32 seconds", () => {
      expect(formatDuration(272000)).toBe("4m 32s");
    });

    it("formats 10 minutes 5 seconds", () => {
      expect(formatDuration(605000)).toBe("10m 5s");
    });

    it("formats 30 minutes 0 seconds", () => {
      expect(formatDuration(1800000)).toBe("30m 0s");
    });

    it("formats 59 minutes 59 seconds", () => {
      expect(formatDuration(3599000)).toBe("59m 59s");
    });

    it("formats 59 minutes 59.999 seconds", () => {
      expect(formatDuration(3599999)).toBe("59m 59s");
    });
  });

  describe("hours range (>= 1 hour)", () => {
    it("formats exactly 1 hour", () => {
      expect(formatDuration(3600000)).toBe("1h 0m");
    });

    it("formats 1 hour 5 minutes", () => {
      expect(formatDuration(3900000)).toBe("1h 5m");
    });

    it("formats 2 hours 30 minutes", () => {
      expect(formatDuration(9000000)).toBe("2h 30m");
    });

    it("formats 5 hours 45 minutes", () => {
      expect(formatDuration(20700000)).toBe("5h 45m");
    });

    it("formats 24 hours", () => {
      expect(formatDuration(86400000)).toBe("24h 0m");
    });
  });

  describe("edge cases and large durations", () => {
    it("handles very large durations", () => {
      expect(formatDuration(100000000)).toBe("27h 46m");
    });

    it("truncates sub-second precision in minute range", () => {
      expect(formatDuration(272999)).toBe("4m 32s");
    });

    it("truncates sub-minute precision in hour range", () => {
      expect(formatDuration(3900999)).toBe("1h 5m");
    });

    it("handles fractional milliseconds by flooring", () => {
      expect(formatDuration(1.9)).toBe("1ms");
    });
  });
});

describe("repeat", () => {
  describe("basic functionality", () => {
    it("repeats a two-character string three times", () => {
      expect(repeat("ab", 3)).toBe("ababab");
    });

    it("repeats a single character multiple times", () => {
      expect(repeat("a", 5)).toBe("aaaaa");
    });

    it("repeats a string once", () => {
      expect(repeat("hello", 1)).toBe("hello");
    });

    it("repeats a longer string", () => {
      expect(repeat("hello", 3)).toBe("hellohellohello");
    });

    it("repeats a word with spaces", () => {
      expect(repeat("hello world ", 2)).toBe("hello world hello world ");
    });
  });

  describe("edge cases with times = 0 or negative", () => {
    it("returns empty string when times is 0", () => {
      expect(repeat("hello", 0)).toBe("");
    });

    it("returns empty string when times is negative", () => {
      expect(repeat("hello", -1)).toBe("");
    });

    it("returns empty string when times is a large negative number", () => {
      expect(repeat("test", -100)).toBe("");
    });
  });

  describe("edge cases with empty string input", () => {
    it("returns empty string when input is empty and times > 0", () => {
      expect(repeat("", 3)).toBe("");
    });

    it("returns empty string when input is empty and times = 0", () => {
      expect(repeat("", 0)).toBe("");
    });

    it("returns empty string when input is empty and times < 0", () => {
      expect(repeat("", -1)).toBe("");
    });
  });

  describe("special characters and unicode", () => {
    it("repeats special characters", () => {
      expect(repeat("!@#", 2)).toBe("!@#!@#");
    });

    it("repeats unicode emoji", () => {
      expect(repeat("🎉", 3)).toBe("🎉🎉🎉");
    });

    it("repeats unicode characters", () => {
      expect(repeat("café", 2)).toBe("cafécafé");
    });

    it("repeats newline characters", () => {
      expect(repeat("\n", 2)).toBe("\n\n");
    });

    it("repeats tab characters", () => {
      expect(repeat("\t", 3)).toBe("\t\t\t");
    });
  });

  describe("performance and large repeat counts", () => {
    it("handles moderately large repeat count efficiently", () => {
      const result = repeat("x", 1000);
      expect(result).toBe("x".repeat(1000));
      expect(result.length).toBe(1000);
    });

    it("handles large repeat count with longer string", () => {
      const result = repeat("abc", 100);
      expect(result.length).toBe(300);
      expect(result.startsWith("abcabcabc")).toBe(true);
      expect(result.endsWith("abcabcabc")).toBe(true);
    });
  });
});
