import { describe, expect, it } from "vitest";
import { DemoPacketProvider, PacketProviderError, TngPacketProvider } from "../apps/api/src/providers/packet-provider";

describe("packet provider boundary", () => {
  it("supports create, claim, list and cancel in deterministic demo mode", async () => {
    const provider = new DemoPacketProvider();
    const packet = await provider.createPacket({ roundId: "R-1", amount: 250 });
    const claim = await provider.claim({ packetId: packet.id, serverSeed: "seed", roundId: "R-1", userId: "U-1", claimSequence: 1 });
    expect(claim.label).toContain("NO CASH VALUE");
    await expect(provider.getClaims(packet.id)).resolves.toHaveLength(1);
    await expect(provider.cancelPacket(packet.id)).resolves.toMatchObject({ cancelledAt: expect.any(String) });
  });
  it("distributes one internal packet across claims and exposes the running summary", async () => {
    const provider = new DemoPacketProvider();
    const packet = await provider.createPacket({ roundId: "R-INTERNAL", amount: 100 });
    expect(packet).toMatchObject({ provider: "InternalPacketProvider", totalAmount: 100, maxClaims: 8, claimedAmount: 0, claimedCount: 0 });
    const claims = await Promise.all(Array.from({ length: 8 }, (_, index) => provider.claim({ packetId: packet.id, serverSeed: "seed", roundId: "R-INTERNAL", userId: `U-${index}`, claimSequence: 1 })));
    expect(claims.reduce((sum, claim) => sum + claim.value, 0)).toBe(100);
    expect(claims.at(-1)).toMatchObject({ claimedAmount: 100, claimedCount: 8, remainingAmount: 0, remainingClaims: 0 });
    await expect(provider.claim({ packetId: packet.id, serverSeed: "seed", roundId: "R-INTERNAL", userId: "U-0", claimSequence: 2 })).rejects.toMatchObject({ code: "ALREADY_CLAIMED" });
  });
  it("keeps TNG explicitly unavailable", async () => {
    await expect(new TngPacketProvider().createPacket({ roundId: "R-1", amount: 1 })).rejects.toBeInstanceOf(PacketProviderError);
    expect(new TngPacketProvider().status).toBe("PROVIDER_NOT_CONFIGURED");
  });
});
