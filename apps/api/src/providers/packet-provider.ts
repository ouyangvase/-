import { demoPacketValue } from "@project12/game-engine";

export type PacketProviderStatus = "DEMO_READY" | "PROVIDER_NOT_CONFIGURED" | "REAL_MONEY_DISABLED";
export type PacketClaimInput = { packetId: string; serverSeed: string; roundId: string; userId: string; claimSequence: number };
export type PacketRecord = { id: string; provider: string; roundId: string; createdAt: string; cancelledAt?: string };
export type PacketClaim = { packetId: string; userId: string; value: number; claimedAt: string; label: string };

export class PacketProviderError extends Error {
  constructor(readonly code: "PROVIDER_NOT_CONFIGURED" | "REAL_MONEY_DISABLED" | "AUTHORIZATION_REQUIRED", message: string) { super(message); }
}

export interface PacketProvider {
  readonly name: string;
  readonly status: PacketProviderStatus;
  createPacket(input: { roundId: string; amount: number }): PacketRecord;
  claim(input: PacketClaimInput): PacketClaim;
  getClaims(packetId: string): PacketClaim[];
  cancelPacket(packetId: string): PacketRecord;
}

export class DemoPacketProvider implements PacketProvider {
  readonly name = "DemoPacketProvider";
  readonly status = "DEMO_READY" as const;
  private readonly packets = new Map<string, PacketRecord>();
  private readonly claims = new Map<string, PacketClaim[]>();

  createPacket(input: { roundId: string; amount: number }): PacketRecord {
    const packet = { id: `demo-packet-${input.roundId}`, provider: this.name, roundId: input.roundId, createdAt: new Date().toISOString() };
    this.packets.set(packet.id, packet);
    this.claims.set(packet.id, []);
    return packet;
  }

  claim(input: PacketClaimInput): PacketClaim {
    const packet = this.packets.get(input.packetId) ?? this.createPacket({ roundId: input.roundId, amount: 0 });
    if (packet.cancelledAt) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Demo packet has been cancelled");
    const claim = { packetId: packet.id, userId: input.userId, value: demoPacketValue(input.serverSeed, input.roundId, input.userId, input.claimSequence), claimedAt: new Date().toISOString(), label: "DEMO CREDIT · NO CASH VALUE" };
    this.claims.get(packet.id)?.push(claim);
    return claim;
  }

  getClaims(packetId: string): PacketClaim[] { return [...(this.claims.get(packetId) ?? [])]; }
  cancelPacket(packetId: string): PacketRecord {
    const packet = this.packets.get(packetId);
    if (!packet) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Packet not found");
    const cancelled = { ...packet, cancelledAt: new Date().toISOString() };
    this.packets.set(packetId, cancelled);
    return cancelled;
  }
}

export class TngPacketProvider implements PacketProvider {
  readonly name = "TngPacketProvider";
  readonly status = "PROVIDER_NOT_CONFIGURED" as const;
  private unavailable(): never { throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "TNG packet provider is not implemented or enabled"); }
  createPacket(): never { return this.unavailable(); }
  claim(): never { return this.unavailable(); }
  getClaims(): never { return this.unavailable(); }
  cancelPacket(): never { return this.unavailable(); }
}

export function createPacketProvider(): PacketProvider { return process.env.PACKET_PROVIDER === "tng" ? new TngPacketProvider() : new DemoPacketProvider(); }
