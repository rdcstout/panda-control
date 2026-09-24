#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const LC_UUID = 0x1b;
const MH_MAGIC_64 = 0xfeedfacf;

const appPath = process.argv[2];
if (!appPath) throw new Error('Usage: stabilize-macos-executable-uuid.mjs /path/to/Panda Control.app');

const plistPath = path.join(appPath, 'Contents', 'Info.plist');
const plist = await readFile(plistPath, 'utf8');
const plistValue = key => {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`));
  if (!match) throw new Error(`${key} is missing from ${plistPath}`);
  return match[1];
};

const bundleId = plistValue('CFBundleIdentifier');
const executableName = plistValue('CFBundleExecutable');
const executablePath = path.join(appPath, 'Contents', 'MacOS', executableName);
const executable = await readFile(executablePath);

if (executable.readUInt32LE(0) !== MH_MAGIC_64) {
  throw new Error('Panda Control UUID stabilization currently requires a thin 64-bit Mach-O executable.');
}

const commandCount = executable.readUInt32LE(16);
let commandOffset = 32;
let uuidOffset = -1;
for (let index = 0; index < commandCount; index += 1) {
  const command = executable.readUInt32LE(commandOffset);
  const commandSize = executable.readUInt32LE(commandOffset + 4);
  if (command === LC_UUID) {
    uuidOffset = commandOffset + 8;
    break;
  }
  if (commandSize < 8) throw new Error('Invalid Mach-O load command size.');
  commandOffset += commandSize;
}

if (uuidOffset < 0) throw new Error('The Panda Control executable has no LC_UUID command.');

const stableUuid = createHash('sha256').update(`Panda Control:${bundleId}`).digest().subarray(0, 16);
stableUuid[6] = stableUuid[6] & 0x0f | 0x50;
stableUuid[8] = stableUuid[8] & 0x3f | 0x80;
stableUuid.copy(executable, uuidOffset);
await writeFile(executablePath, executable);

const hex = stableUuid.toString('hex').toUpperCase();
console.log(`Stable Panda Control executable UUID: ${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
