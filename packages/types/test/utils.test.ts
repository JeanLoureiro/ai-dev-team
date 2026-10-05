import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/utils";

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
