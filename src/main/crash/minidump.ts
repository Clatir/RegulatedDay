/**
 * The process type of a Crashpad minidump (spec „Terminy”): a dump counts as a crash of the app only with the annotation
 * process_type „browser” – the dumps of the renderer and the GPU process land in the same folder. Read from the stream
 * MinidumpCrashpadInfo (0x43500001): its simple annotations and each module's simple annotations and annotation objects.
 */
const CRASHPAD_INFO_STREAM = 0x43500001

function utf8At(buf: Buffer, rva: number): string | null {
  if (rva <= 0 || rva + 4 > buf.length) return null
  const len = buf.readUInt32LE(rva)
  if (rva + 4 + len > buf.length || len > 4096) return null
  return buf.toString('utf8', rva + 4, rva + 4 + len)
}

/** MinidumpSimpleStringDictionary: count, then {key RVA, value RVA} pairs of MinidumpUTF8String. */
function simpleDictionary(buf: Buffer, rva: number, size: number, out: Map<string, string>): void {
  if (rva <= 0 || size < 4 || rva + 4 > buf.length) return
  const count = buf.readUInt32LE(rva)
  for (let i = 0; i < count && rva + 4 + i * 8 + 8 <= buf.length; i++) {
    const k = utf8At(buf, buf.readUInt32LE(rva + 4 + i * 8))
    const v = utf8At(buf, buf.readUInt32LE(rva + 8 + i * 8))
    if (k != null && v != null) out.set(k, v)
  }
}

/** MinidumpAnnotationList: count, then {name RVA (UTF8String), type u16, reserved u16, value RVA (ByteArray)}. */
function annotationList(buf: Buffer, rva: number, size: number, out: Map<string, string>): void {
  if (rva <= 0 || size < 4 || rva + 4 > buf.length) return
  const count = buf.readUInt32LE(rva)
  for (let i = 0; i < count && rva + 4 + i * 12 + 12 <= buf.length; i++) {
    const at = rva + 4 + i * 12
    const name = utf8At(buf, buf.readUInt32LE(at))
    const value = utf8At(buf, buf.readUInt32LE(at + 8))
    if (name != null && value != null) out.set(name, value.replace(/\0+$/, ''))
  }
}

/** All annotations of the dump (empty when it has no Crashpad info). */
export function minidumpAnnotations(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>()
  if (buf.length < 32 || buf.toString('ascii', 0, 4) !== 'MDMP') return out
  const streams = buf.readUInt32LE(8)
  const dir = buf.readUInt32LE(12)
  for (let i = 0; i < streams && dir + i * 12 + 12 <= buf.length; i++) {
    const at = dir + i * 12
    if (buf.readUInt32LE(at) !== CRASHPAD_INFO_STREAM) continue
    const rva = buf.readUInt32LE(at + 8)
    // MinidumpCrashpadInfo: version u32, report_id UUID, client_id UUID, simple_annotations {size, rva}, module_list {size, rva}.
    if (rva + 4 + 32 + 16 > buf.length) return out
    const simpleSize = buf.readUInt32LE(rva + 36)
    const simpleRva = buf.readUInt32LE(rva + 40)
    simpleDictionary(buf, simpleRva, simpleSize, out)
    const listSize = buf.readUInt32LE(rva + 44)
    const listRva = buf.readUInt32LE(rva + 48)
    if (listRva <= 0 || listSize < 4 || listRva + 4 > buf.length) return out
    // MinidumpModuleCrashpadInfoList: count, then {minidump_module_list_index u32, location {size, rva}}.
    const modules = buf.readUInt32LE(listRva)
    for (let m = 0; m < modules && listRva + 4 + m * 12 + 12 <= buf.length; m++) {
      const loc = listRva + 4 + m * 12
      const infoRva = buf.readUInt32LE(loc + 8)
      // MinidumpModuleCrashpadInfo: version u32, list_annotations {size, rva}, simple_annotations {size, rva}, annotation_objects {size, rva}.
      if (infoRva + 28 > buf.length) continue
      simpleDictionary(buf, buf.readUInt32LE(infoRva + 16), buf.readUInt32LE(infoRva + 12), out)
      annotationList(buf, buf.readUInt32LE(infoRva + 24), buf.readUInt32LE(infoRva + 20), out)
    }
    return out
  }
  return out
}

/** „browser”, „renderer”, „gpu-process”…; null = not known (such a dump never counts as the app's crash). */
export function minidumpProcessType(buf: Buffer): string | null {
  const a = minidumpAnnotations(buf)
  return a.get('process_type') ?? a.get('ptype') ?? null
}
