import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// globals を使わない設定なので、Testing Library の後片付けを自分で登録する
afterEach(() => cleanup())
