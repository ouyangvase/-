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
  it("keeps TNG explicitly unavailable", async () => {
    await expect(new TngPacketProvider().createPacket({ roundId: "R-1", amount: 1 })).rejects.toBeInstanceOf(PacketProviderError);
    expect(new TngPacketProvider().status).toBe("PROVIDER_NOT_CONFIGURED");
  });
});
