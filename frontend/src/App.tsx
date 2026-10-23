import { useState } from 'react'

function App() {
  const [response, setResponse] = useState('')

  const checkAi = async () => {
    const res = await fetch('/api/ai/ping?message=Привет, скажи что-нибудь')
    const text = await res.text()
    setResponse(text)
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Hackathon Skeleton</h1>
      <button onClick={checkAi}>Проверить связь с AI</button>
      <p><strong>Ответ:</strong> {response}</p>
    </div>
  )
}

export default App