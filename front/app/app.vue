<template>
  <div class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">Quizzy</p>
        <h1>Votez en un scan ✨</h1>
        <p class="subtitle">
          Une SPA de sondage ultra rapide : connectez-vous, scannez un QRCode,
          voyez les résultats en direct.
        </p>
      </div>
      <div class="status-card" v-if="authToken">
        <p class="status-title">Session active</p>
        <p class="status-subtitle">Connecté en tant que {{ username }}.</p>
        <button class="ghost" type="button" @click="logout">
          Se déconnecter
        </button>
      </div>
    </header>

    <section class="auth" v-if="!authToken">
      <div class="card">
        <h2>Accès rapide</h2>
        <p class="muted">
          Créez un compte ou connectez-vous pour participer au sondage.
        </p>
        <p v-if="authNotice" class="message">{{ authNotice }}</p>
        <form class="form" @submit.prevent="submitAuth">
          <label>
            Nom d'utilisateur
            <input v-model.trim="form.username" type="text" required />
          </label>
          <label>
            Mot de passe
            <input v-model="form.password" type="password" required />
          </label>
          <div class="actions">
            <button type="button" class="ghost" @click="toggleMode">
              {{ isRegisterMode ? 'Déjà un compte ?' : 'Créer un compte' }}
            </button>
            <button type="submit" class="primary">
              {{ isRegisterMode ? 'S\'inscrire' : 'Se connecter' }}
            </button>
          </div>
          <p v-if="authError" class="error">{{ authError }}</p>
        </form>
      </div>
    </section>

    <section v-if="authToken" class="polling">
      <div class="card highlight">
        <div>
          <p class="eyebrow">Question du moment</p>
          <h2>{{ pollConfig?.question || 'Chargement...' }}</h2>
          <p class="muted">
            Temps restant :
            <span class="timer">{{ timeRemaining }}</span>
          </p>
        </div>
        <div class="countdown">
          <div>
            <span>{{ voteStats.totalVotes }}</span>
            <small>votes</small>
          </div>
        </div>
      </div>

      <div class="grid">
        <article
          v-for="choice in pollConfig?.choices || []"
          :key="choice.id"
          class="card choice"
        >
          <div class="qr-wrapper">
            <img
              :src="`${backendUrl}${choice.qrCodeUrl}`"
              :alt="`QRCode pour ${choice.label}`"
            />
          </div>
          <h3>{{ choice.label }}</h3>
          <p class="muted">Scannez ce QRCode pour voter.</p>
          <div class="results">
            <span>{{ getChoiceCount(choice.id) }} votes</span>
            <span class="percent">
              {{ getChoicePercent(choice.id) }}%
            </span>
          </div>
          <button
            class="primary"
            type="button"
            :disabled="hasVoted || isVoteClosed"
            @click="castVote(choice.id)"
          >
            {{ hasVoted ? 'Vote enregistré' : 'Voter maintenant' }}
          </button>
        </article>
      </div>

      <p v-if="voteMessage" class="message">{{ voteMessage }}</p>
    </section>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref, computed, watch } from 'vue'

const config = useRuntimeConfig()
const backendUrl = config.public.backendUrl
const route = useRoute()

const form = reactive({
  username: '',
  password: ''
})

const authToken = ref('')
const username = ref('')
const authError = ref('')
const pollConfig = ref(null)
const voteStats = reactive({ totalVotes: 0, results: [] })
const voteMessage = ref('')
const hasVoted = ref(false)
const pollingInterval = ref(null)
const isRegisterMode = ref(true)
const authNotice = computed(() => {
  return typeof route.query.authMessage === 'string'
    ? route.query.authMessage
    : ''
})

const isVoteClosed = computed(() => {
  if (!pollConfig.value?.voteEndsAt) return false
  return Date.now() > new Date(pollConfig.value.voteEndsAt).getTime()
})

const timeRemaining = computed(() => {
  if (!pollConfig.value?.voteEndsAt) return '—'
  const diff = new Date(pollConfig.value.voteEndsAt).getTime() - Date.now()
  if (diff <= 0) return 'Terminé'
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60
  if (days > 0) {
    return `${days}j ${remainingHours}h`
  }
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`
  }
  return `${remainingMinutes}m`
})

const submitAuth = async () => {
  authError.value = ''
  voteMessage.value = ''

  try {
    const endpoint = isRegisterMode.value ? 'register' : 'login'
    const response = await fetch(`${backendUrl}/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.username,
        password: form.password
      })
    })

    const data = await response.json()

    if (!response.ok) {
      authError.value = data?.error || 'Erreur lors de la connexion.'
      return
    }

    authToken.value = data.token
    username.value = form.username
    window.localStorage.setItem('quizzy.token', data.token)
    window.localStorage.setItem('quizzy.username', form.username)
    await loadPollConfig()
    await refreshResults()
    startPolling()
  } catch (error) {
    authError.value = 'Impossible de joindre le serveur.'
  }
}

const toggleMode = () => {
  isRegisterMode.value = !isRegisterMode.value
  authError.value = ''
}

const logout = () => {
  authToken.value = ''
  username.value = ''
  pollConfig.value = null
  voteStats.totalVotes = 0
  voteStats.results = []
  hasVoted.value = false
  window.localStorage.removeItem('quizzy.token')
  window.localStorage.removeItem('quizzy.username')
  window.localStorage.removeItem('quizzy.voted')
  stopPolling()
}

const applyPollConfig = (nextConfig) => {
  const previousSessionId = pollConfig.value?.sessionId
  pollConfig.value = nextConfig

  if (previousSessionId && previousSessionId !== nextConfig?.sessionId) {
    hasVoted.value = false
    voteMessage.value = ''
    voteStats.totalVotes = 0
    voteStats.results = []
    window.localStorage.removeItem('quizzy.voted')
  }
}

const loadPollConfig = async () => {
  if (!authToken.value) return
  const response = await fetch(`${backendUrl}/config`, {
    headers: {
      Authorization: `Bearer ${authToken.value}`
    }
  })

  if (!response.ok) {
    authError.value = 'Session expirée, reconnectez-vous.'
    logout()
    return
  }

  const nextConfig = await response.json()
  applyPollConfig(nextConfig)
}

const refreshResults = async () => {
  if (!authToken.value) return
  const response = await fetch(`${backendUrl}/results`, {
    headers: {
      Authorization: `Bearer ${authToken.value}`
    }
  })

  if (!response.ok) {
    return
  }

  const data = await response.json()
  voteStats.totalVotes = data.totalVotes
  voteStats.results = data.results
}

const castVote = async (choiceId) => {
  if (hasVoted.value || isVoteClosed.value) return
  voteMessage.value = ''

  try {
    const response = await fetch(`${backendUrl}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        choiceId,
        userToken: authToken.value
      })
    })

    const data = await response.json()

    if (!response.ok) {
      voteMessage.value = data?.error || 'Impossible de voter.'
      return
    }

    hasVoted.value = true
    window.localStorage.setItem('quizzy.voted', 'true')
    voteMessage.value = 'Merci ! Votre vote a bien été pris en compte.'
    await refreshResults()
  } catch (error) {
    voteMessage.value = 'Erreur réseau lors du vote.'
  }
}

const getChoiceCount = (choiceId) => {
  const entry = voteStats.results.find((result) => result.choiceId === choiceId)
  return entry ? entry.count : 0
}

const getChoicePercent = (choiceId) => {
  if (!voteStats.totalVotes) return 0
  const count = getChoiceCount(choiceId)
  return Math.round((count / voteStats.totalVotes) * 100)
}

const startPolling = () => {
  stopPolling()
  pollingInterval.value = window.setInterval(() => {
    loadPollConfig()
    refreshResults()
  }, 5000)
}

const stopPolling = () => {
  if (pollingInterval.value) {
    window.clearInterval(pollingInterval.value)
    pollingInterval.value = null
  }
}

onMounted(async () => {
  const storedToken = window.localStorage.getItem('quizzy.token')
  const storedUser = window.localStorage.getItem('quizzy.username')
  const storedVoted = window.localStorage.getItem('quizzy.voted')

  if (storedToken) {
    authToken.value = storedToken
    username.value = storedUser || ''
    hasVoted.value = storedVoted === 'true'
    await loadPollConfig()
    await refreshResults()
    startPolling()
  }
})

onBeforeUnmount(() => {
  stopPolling()
})

watch(isVoteClosed, (closed) => {
  if (closed) {
    voteMessage.value = 'Le vote est terminé.'
  }
})
</script>

<style scoped>
:global(body) {
  margin: 0;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  background: radial-gradient(circle at top, #1f1f3a, #0e0e14 60%);
  color: #f8f8ff;
}

.page {
  min-height: 100vh;
  padding: 48px 6vw 80px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.hero {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 24px;
  align-items: center;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.4em;
  font-size: 12px;
  color: #7f7dff;
}

.subtitle {
  max-width: 520px;
  color: #c9c8ff;
}

.card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
}

.status-card {
  min-width: 220px;
}

.status-title {
  font-weight: 600;
  margin-bottom: 6px;
}

.status-subtitle {
  color: #d5d4ff;
  margin-bottom: 16px;
}

.auth {
  display: flex;
  justify-content: center;
}

.form {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

label {
  display: grid;
  gap: 8px;
  font-size: 14px;
}

input {
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
}

input:focus {
  outline: none;
  border-color: #7f7dff;
}

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.primary {
  background: linear-gradient(120deg, #7f7dff, #ff8fd8);
  color: #0e0e14;
  font-weight: 600;
  border: none;
  border-radius: 999px;
  padding: 10px 20px;
  cursor: pointer;
}

.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost {
  background: transparent;
  color: #c9c8ff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  padding: 8px 16px;
  cursor: pointer;
}

.highlight {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.countdown {
  display: grid;
  place-items: center;
  min-width: 120px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 16px;
  padding: 20px 24px;
}

.countdown span {
  font-size: 32px;
  font-weight: 700;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.choice {
  display: grid;
  gap: 16px;
}

.qr-wrapper {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 16px;
  display: grid;
  place-items: center;
}

.qr-wrapper img {
  width: 160px;
  height: 160px;
}

.results {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: #d5d4ff;
}

.percent {
  font-weight: 600;
  color: #7f7dff;
}

.muted {
  color: #b7b6ff;
}

.error {
  color: #ff9fb8;
}

.message {
  text-align: center;
  color: #b7b6ff;
}

.timer {
  font-weight: 600;
}

@media (max-width: 700px) {
  .page {
    padding: 32px 20px 60px;
  }

  .actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
