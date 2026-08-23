import { demoPacketValue } from "../../../../packages/game-engine/src/index.js";

export type PacketProviderStatus = "READY" | "PROVIDER_NOT_CONFIGURED" | "REAL_MONEY_DISABLED";
export type PacketClaimInput = { packetId: string; serverSeed: string; roundId: string; userId: string; claimSequence: number };
export type PacketRecord = { id: string; provider: string; roundId: string; createdAt: string; totalAmount: number; maxClaims: number; claimedAmount: number; claimedCount: number; expiresAt: string; cancelledAt?: string };
export type PacketClaim = { packetId: string; userId: string; value: number; claimedAt: string; claimSequence: number; label: string; totalAmount: number; maxClaims: number; claimedAmount: number; claimedCount: number; remainingAmount: number; remainingClaims: number };
export type PacketStore = {
  readonly configured: boolean;
  createInternalPacket(input: { roundId: string; amount: number; maxClaims?: number; serverSeedHash?: string }): Promise<PacketRecord>;
  getInternalPacket(roundId: string): Promise<PacketRecord | undefined>;
  claimInternalPacket(input: PacketClaimInput): Promise<PacketClaim>;
  getInternalPacketClaims(packetId: string): Promise<PacketClaim[]>;
  cancelInternalPacket(packetId: string): Promise<PacketRecord>;
};

export class PacketProviderError extends Error {
  constructor(readonly code: "PROVIDER_NOT_CONFIGURED" | "REAL_MONEY_DISABLED" | "AUTHORIZATION_REQUIRED" | "ROUND_PARTICIPANT_REQUIRED" | "ALREADY_CLAIMED" | "PACKET_EXHAUSTED", message: string) { super(message); }
}

export interface PacketProvider {
  readonly name: string;
  readonly status: PacketProviderStatus;
  createPacket(input: { roundId: string; amount: number; maxClaims?: number; serverSeedHash?: string }): Promise<PacketRecord>;
  getPacket(roundId: string): Promise<PacketRecord | undefined>;
  claim(input: PacketClaimInput): Promise<PacketClaim>;
  getClaims(packetId: string): Promise<PacketClaim[]>;
  cancelPacket(packetId: string): Promise<PacketRecord>;
}

export class DemoPacketProvider implements PacketProvider {
  readonly name = "InternalPacketProvider";
  readonly status = "READY" as const;
  private readonly packets = new Map<string, PacketRecord>();
  private readonly claims = new Map<string, PacketClaim[]>();

  constructor(private readonly store?: PacketStore) {}

  async createPacket(input: { roundId: string; amount: number; maxClaims?: number; serverSeedHash?: string }): Promise<PacketRecord> {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Internal packet amount must be a positive integer");
    if (this.store?.configured) return this.store.createInternalPacket(input);
    const packetId = `internal-packet-${input.roundId}`;
    const existing = this.packets.get(packetId);
    if (existing) return { ...existing };
    const maxClaims = Math.max(1, Math.min(input.maxClaims ?? 8, input.amount));
    const packet = { id: packetId, provider: this.name, roundId: input.roundId, createdAt: new Date().toISOString(), totalAmount: input.amount, maxClaims, claimedAmount: 0, claimedCount: 0, expiresAt: new Date(Date.now() + 45_000).toISOString() };
    this.packets.set(packet.id, packet);
    this.claims.set(packet.id, []);
    return { ...packet };
  }

  async getPacket(roundId: string): Promise<PacketRecord | undefined> {
    if (this.store?.configured) return this.store.getInternalPacket(roundId);
    const packet = this.packets.get(`internal-packet-${roundId}`);
    return packet ? { ...packet } : undefined;
  }

  async claim(input: PacketClaimInput): Promise<PacketClaim> {
    if (this.store?.configured) return this.store.claimInternalPacket(input);
    const packet = this.packets.get(input.packetId) ?? await this.createPacket({ roundId: input.roundId, amount: 250 });
    if (packet.cancelledAt) throw new PacketProviderError("PROVIDER_NOT_CONFIGURED", "Demo packet has been cancelled");
    const claims = this.claims.get(packet.id) ?? [];
    if (claims.some((claim) => claim.userId === input.userId)) throw new PacketProviderError("ALREADY_CLAIMED", "You have already claimed this internal packet");
    if (claims.length >= packet.maxClaims || packet.claimedAmount >= packet.totalAmount) throw new PacketProviderError("PACKET_EXHAUSTED", "Internal packet has been fully claimed");
    const claimSequence = claims.length + 1;
    const remainingClaims = packet.maxClaims - claims.length;
    const remainingAmount = packet.totalAmount - packet.claimedAmount;
    const value = remainingClaims === 1 ? remainingAmount : demoPacketValue(input.serverSeed, input.roundId, input.userId, claimSequence, 1, remainingAmount - (remainingClaims - 1));
    const claimedAt = new Date().toISOString();
    const claim = { packetId: packet.id, userId: input.userId, value, claimedAt, claimSequence, label: "PROJECT 12 INTERNAL CREDIT · NO CASH VALUE", totalAmount: packet.totalAmount, maxClaims: packet.maxClaims, claimedAmount: packet.claimedAmount + value, claimedCount: claims.length + 1, remainingAmount: remainingAmount - value, remainingClaims: remainingClaims - 1 };
    claims.push(claim);
    this.claims.set(packet.id, claims);
    this.packets.set(packet.id, { ...packet, claimedAmount: claim.claimedAmount, claimedCount: claim.claimedCount });
    return claim;
  }

  async getClaims(packetId: string): Promise<PacketClaim[]> {
    if (this.store?.configured) return this.store.getInternalPacketClaims(packetId);
    return [...(this.claims.get(packetId) ?? [])];
  }
  async cancelPacket(packetId: string): Promise<PacketRecord> {
    if (this.store?.configured) return this.store.cancelInternalPacket(packetId);
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
  async createPacket(): Promise<never> { return this.unavailable(); }
  async getPacket(): Promise<never> { return this.unavailable(); }
  async claim(): Promise<never> { return this.unavailable(); }
  async getClaims(): Promise<never> { return this.unavailable(); }
  async cancelPacket(): Promise<never> { return this.unavailable(); }
}

export function createPacketProvider(store?: PacketStore): PacketProvider { return new DemoPacketProvider(store); }
