import { describe, it, expect } from "vitest";
import { canonicalJson } from "@/domain/canonical";

describe("canonicalJson", () => {
  it("sorts object keys deterministically", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("removes keys whose value is null", () => {
    expect(canonicalJson({ a: 1, b: null })).toBe('{"a":1}');
  });

  it("trims strings and collapses whitespace", () => {
    expect(canonicalJson({ s: "  hello   world  " })).toBe('{"s":"hello world"}');
  });

  it("coerces integer-valued numbers to integers", () => {
    expect(canonicalJson({ price: 25000.0 })).toBe('{"price":25000}');
  });

  it("handles nested objects and arrays", () => {
    const out = canonicalJson({
      payload: { b: 2, a: 1, arr: [{ y: 2, x: 1 }] },
    });
    expect(out).toBe('{"payload":{"a":1,"arr":[{"x":1,"y":2}],"b":2}}');
  });

  it("is stable across equivalent inputs", () => {
    const a = { x: "  foo ", y: null, z: 3 };
    const b = { z: 3.0, x: "foo", y: null };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});
