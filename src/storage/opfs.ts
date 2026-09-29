/** PDF 本体の置き場。本番は OPFS、テストでは差し替える。 */
export interface FileStore {
  write(path: string, data: Uint8Array): Promise<void>
  read(path: string): Promise<Uint8Array>
}

export class StorageUnavailableError extends Error {
  constructor() {
    super('この環境では端末内にPDFを保存できません（OPFS 非対応）')
    this.name = 'StorageUnavailableError'
  }
}

async function dirFor(path: string, create: boolean) {
  if (!navigator.storage?.getDirectory) throw new StorageUnavailableError()
  const parts = path.split('/')
  const name = parts.pop()!
  let dir = await navigator.storage.getDirectory()
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create })
  return { dir, name }
}

export const opfsStore: FileStore = {
  async write(path, data) {
    const { dir, name } = await dirFor(path, true)
    const handle = await dir.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    try {
      await writable.write(data as Uint8Array<ArrayBuffer>)
    } finally {
      await writable.close()
    }
  },
  async read(path) {
    const { dir, name } = await dirFor(path, false)
    const file = await (await dir.getFileHandle(name)).getFile()
    return new Uint8Array(await file.arrayBuffer())
  },
}

/** 保存領域を「消されにくい」扱いにしてもらう（断られても動作は続ける）。 */
export async function requestPersistentStorage() {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
