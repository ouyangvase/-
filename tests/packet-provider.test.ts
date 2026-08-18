import { describe, expect, it } from "vitest";
import { DemoPacketProvider, PacketProviderError, TngPacketProvider } from "../apps/api/src/providers/packet-provider";

describe("packet provider boundary", () => {
  it("supports create, claim, list and cancel in deterministic demo mode", () => {
    const provider = new DemoPacketProvider();
    const packet = provider.createPacket({ roundId: "R-1", amount: 250 });
    const claim = provider.claim({ packetId: packet.id, serverSeed: "seed", roundId: "R-1", userId: "U-1", claimSequence: 1 });
    expect(claim.label).toContain("NO CASH VALUE");
    expect(provider.getClaims(packet.id)).toHaveLength(1);
    expect(provider.cancelPacket(packet.id).cancelledAt).toBeTruthy();
  });
  it("keeps TNG explicitly unavailable", () => {
    expect(() => new TngPacketProvider().createPacket({ roundId: "R-1", amount: 1 })).toThrow(PacketProviderError);
    expect(new TngPacketProvider().status).toBe("PROVIDER_NOT_CONFIGURED");
  });
});
