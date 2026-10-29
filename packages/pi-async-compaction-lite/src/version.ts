import { VERSION } from "@earendil-works/pi-coding-agent";

export function assertSupportedPi(version = VERSION): void {
	if (!/^1\.4\.\d+$/.test(version)) {
		throw new Error(`@runecraft/pi-async-compaction-lite requires Pi >=1.4.0 <1.5.0; host is ${version}. Refusing to enable async compaction.`);
	}
}
