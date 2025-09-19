// Smoke test to verify Jest is properly configured and running
describe("Smoke Test", () => {
  it("should run Jest and basic assertions work", () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
    expect("hello").toEqual("hello");
  });

  it("should verify Jest can handle async operations", async () => {
    const asyncResult = await Promise.resolve("async test");
    expect(asyncResult).toBe("async test");
  });
});
