/*
 * Copyright 2022 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { arrayHasDiff } from "./arrays";

export function mayBeAnimated(mimeType: string): boolean {
    return ["image/gif", "image/webp", "image/png", "image/apng"].includes(mimeType);
}

function arrayBufferRead(arr: ArrayBuffer, start: number, len: number): Uint8Array {
    return new Uint8Array(arr.slice(start, start + len));
}

function arrayBufferReadInt(arr: ArrayBuffer, start: number): number {
    const dv = new DataView(arr, start, 4);
    return dv.getUint32(0);
}

function arrayBufferReadStr(arr: ArrayBuffer, start: number, len: number): string {
    return String.fromCharCode.apply(null, arrayBufferRead(arr, start, len));
}

export async function blobIsAnimated(mimeType: string, blob: Blob): Promise<boolean> {
    switch (mimeType) {
        case "image/webp": {
            // Only extended file format WEBP images support animation, so grab the expected data range and verify header.
            // Based on https://developers.google.com/speed/webp/docs/riff_container#extended_file_format
            const arr = await blob.slice(0, 17).arrayBuffer();
            if (
                arrayBufferReadStr(arr, 0, 4) === "RIFF" &&
                arrayBufferReadStr(arr, 8, 4) === "WEBP" &&
                arrayBufferReadStr(arr, 12, 4) === "VP8X"
            ) {
                const [flags] = arrayBufferRead(arr, 16, 1);
                // Flags: R R I L E X _A_ R (reversed)
                const animationFlagMask = 1 << 1;
                return (flags & animationFlagMask) != 0;
            }
            break;
        }

        case "image/gif": {
            // Based on https://gist.github.com/zakirt/faa4a58cec5a7505b10e3686a226f285
            // More info at http://www.matthewflickinger.com/lab/whatsinagif/bits_and_bytes.asp
            const dv = new DataView(await blob.arrayBuffer(), 10);

            const globalColorTable = dv.getUint8(0);
            let globalColorTableSize = 0;
            // check first bit, if 0, then we don't have a Global Color Table
            if (globalColorTable & 0x80) {
                // grab the last 3 bits, to calculate the global color table size -> RGB * 2^(N+1)
                // N is the value in the last 3 bits.
                globalColorTableSize = 3 * Math.pow(2, (globalColorTable & 0x7) + 1);
            }

            // move on to the Graphics Control Extension
            const offset = 3 + globalColorTableSize;

            const extensionIntroducer = dv.getUint8(offset);
            const graphicsControlLabel = dv.getUint8(offset + 1);
            let delayTime = 0;

            // Graphics Control Extension section is where GIF animation data is stored
            // First 2 bytes must be 0x21 and 0xF9
            if ((extensionIntroducer & 0x21) && (graphicsControlLabel & 0xF9)) {
                // skip to the 2 bytes with the delay time
                delayTime = dv.getUint16(offset + 4);
            }

            return !!delayTime;
        }

        case "image/png":
        case "image/apng": {
            // Based on https://stackoverflow.com/a/68618296
            const arr = await blob.arrayBuffer();
            if (arrayHasDiff([
                0x89,
                0x50, 0x4E, 0x47,
                0x0D, 0x0A,
                0x1A,
                0x0A,
            ], Array.from(arrayBufferRead(arr, 0, 8)))) {
                return false;
            }

            for (let i = 8; i < blob.size;) {
                const length = arrayBufferReadInt(arr, i);
                i += 4;
                const type = arrayBufferReadStr(arr, i, 4);
                i += 4;

                switch (type) {
                    case "acTL":
                        return true;
                    case "IDAT":
                        return false;
                }
                i += length + 4;
            }
            break;
        }
    }

    return false;
}
