import { openCapacitorDriver } from '@/db/capacitorDriver'
import { migrate } from '@/db/migrate'
import { SerializedDatabase } from '@/db/SerializedDatabase'
import { createRepositories, type Repositories } from '@/repositories'

let opening: Promise<Repositories> | null = null

/**
 * Opens the local database once per app session and brings its schema up to date.
 * If opening fails the promise is cleared so the UI can offer a retry.
 */
export function openDatabase(): Promise<Repositories> {
  if (!opening) {
    opening = (async () => {
      const driver = await openCapacitorDriver()
      const db = new SerializedDatabase(driver)
      await migrate(db)
      return createRepositories(db)
    })().catch((err) => {
      opening = null
      throw err
    })
  }
  return opening
}
