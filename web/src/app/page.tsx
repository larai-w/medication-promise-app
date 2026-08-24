import ConsentGate from '@/components/ConsentGate'
import MainScreen from '@/components/MainScreen'

export default function Home() {
  return (
    <ConsentGate>
      <MainScreen />
    </ConsentGate>
  )
}
