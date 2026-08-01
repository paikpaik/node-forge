import { describe, it, expect } from "vitest";
import { AdminEventBus } from "./admin-event-bus";

describe("AdminEventBus", () => {
  it("emit한 이벤트를 stream$ 구독자가 받는다", () => {
    const bus = new AdminEventBus<{ type: string }>();
    const received: { type: string }[] = [];
    bus.stream$.subscribe((event) => received.push(event));

    bus.emit({ type: "created" });
    bus.emit({ type: "published" });

    expect(received).toEqual([{ type: "created" }, { type: "published" }]);
  });

  it("여러 구독자 모두에게 같은 이벤트를 방송한다(멀티캐스트)", () => {
    const bus = new AdminEventBus<string>();
    const a: string[] = [];
    const b: string[] = [];
    bus.stream$.subscribe((event) => a.push(event));
    bus.stream$.subscribe((event) => b.push(event));

    bus.emit("hello");

    expect(a).toEqual(["hello"]);
    expect(b).toEqual(["hello"]);
  });

  it("구독 이전에 emit된 이벤트는 받지 못한다", () => {
    const bus = new AdminEventBus<string>();
    bus.emit("before-subscribe");

    const received: string[] = [];
    bus.stream$.subscribe((event) => received.push(event));
    bus.emit("after-subscribe");

    expect(received).toEqual(["after-subscribe"]);
  });

  it("구독을 해지하면 이후 이벤트를 받지 않는다", () => {
    const bus = new AdminEventBus<string>();
    const received: string[] = [];
    const subscription = bus.stream$.subscribe((event) => received.push(event));

    bus.emit("first");
    subscription.unsubscribe();
    bus.emit("second");

    expect(received).toEqual(["first"]);
  });

  it("구독자가 없어도 emit이 에러 없이 동작한다", () => {
    const bus = new AdminEventBus<string>();
    expect(() => bus.emit("no-subscribers")).not.toThrow();
  });
});
