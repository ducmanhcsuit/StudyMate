import { useEffect, useState } from 'react'
import { healthResponse } from '@studymate/shared'

function App() {
  const [status, setStatus] = useState('đang kiểm tra...')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        const { db, ai } = healthResponse.parse(data)
        setStatus(`API OK · database ${db ? 'OK' : 'lỗi'} · AI ${ai ? 'OK' : 'lỗi'}`)
      })
      .catch(() => setStatus('Không kết nối được API'))
  }, [])

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold">StudyMate</h1>
      <p className="mt-2 text-gray-600">Trạng thái hệ thống: {status}</p>
    </main>
  )
}

export default App
