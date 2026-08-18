import { demoPacketValue } from "@project12/game-engine";

export type PacketProviderStatus = "DEMO_READY" | "UNIMPLEMENTED";
export type PacketClaimInput = { serverSeed: string; roundId: string; userId: string; claimSequence: number };

export interface PacketProvider {
  readonly name: string;
  readonly status: PacketProviderStatus;
  claim(input: PacketClaimInput): { value: number; label: string };
}

export class DemoPacketProvider implements PacketProvider {
  readonly name = "DemoPacketProvider";
  readonly status = "DEMO_READY" as const;
  claim(input: PacketClaimInput) { return { value: demoPacketValue(input.serverSeed, input.roundId, input.userId, input.claimSequence), label: "DEMO CREDIT · NO CASH VALUE" }; }
}

export class TngPacketProvider implements PacketProvider {
  readonly name = "TngPacketProvider";
  readonly status = "UNIMPLEMENTED" as const;
  claim(): never { throw new Error("TNG packet provider is not implemented or enabled"); }
}

export function createPacketProvider(): PacketProvider {
  return process.env.PACKET_PROVIDER === "tng" ? new TngPacketProvider() : new DemoPacketProvider();
}
