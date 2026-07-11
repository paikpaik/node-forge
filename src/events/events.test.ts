import { describe, it, expect, vi } from "vitest";
import { ForgeEventBus, createEventBus } from "./events";

describe("ForgeEventBus", () => {
  it("createEventBus로 인스턴스를 생성한다", () => {
    const bus = createEventBus();
    expect(bus).toBeInstanceOf(ForgeEventBus);
  });

  it("emit/on으로 이벤트를 발행하고 수신한다", () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on("user.created", listener);
    bus.emit("user.created", { id: 1 });
    expect(listener).toHaveBeenCalledWith({ id: 1 });
  });

  it("once는 한 번만 실행된다", () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.once("order.placed", listener);
    bus.emit("order.placed", { orderId: "A1" });
    bus.emit("order.placed", { orderId: "A2" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("off로 리스너를 제거한다", () => {
    const bus = createEventBus();
    const listener = vi.fn();
    bus.on("ping", listener);
    bus.off("ping", listener);
    bus.emit("ping");
    expect(listener).not.toHaveBeenCalled();
  });

  it("wildcard 이벤트(user.*)를 수신한다", () => {
    const bus = createEventBus({ wildcard: true });
    const listener = vi.fn();
    bus.on("user.*", listener);
    bus.emit("user.created", { id: 1 });
    bus.emit("user.deleted", { id: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("emitAsync로 비동기 리스너를 처리한다", async () => {
    const bus = createEventBus();
    const results: number[] = [];
    bus.on("task", async (n: unknown) => {
      await new Promise((r) => setTimeout(r, 5));
      results.push(n as number);
    });
    await bus.emitAsync("task", 42);
    expect(results).toEqual([42]);
  });

  it("removeAllListeners로 모든 리스너를 제거한다", () => {
    const bus = createEventBus();
    bus.on("a", vi.fn());
    bus.on("b", vi.fn());
    bus.removeAllListeners();
    expect(bus.listenerCount("a")).toBe(0);
    expect(bus.listenerCount("b")).toBe(0);
  });

  it("getEmitter()로 EventEmitter2 인스턴스를 반환한다", () => {
    const bus = createEventBus();
    expect(bus.getEmitter()).toBeDefined();
  });
});
