<template>
  <div class="page">
    <div class="card">
      <p class="eyebrow">Vote</p>
      <h1>Validation du vote</h1>
      <p class="status" :class="statusClass">{{ statusText }}</p>
      <p v-if="detail" class="detail">{{ detail }}</p>
      <NuxtLink to="/" class="primary">Retour à l'accueil</NuxtLink>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const backendUrl = config.public.backendUrl

const status = ref('pending')
const detail = ref('')

const statusText = computed(() => {
  if (status.value === 'success') return 'Vote OK ✅'
  if (status.value === 'error') return 'Vote refusé ❌'
  return 'Vote en cours...'
})

const statusClass = computed(() => ({
  pending: status.value === 'pending',
  success: status.value === 'success',
  error: status.value === 'error'
}))

const startVote = async () => {
  const choiceId = Number(route.query.choiceId)
  if (!choiceId) {
    status.value = 'error'
    detail.value = 'Identifiant de choix invalide.'
    return
  }

  const token = window.localStorage.getItem('quizzy.token')
  if (!token) {
    const message = 'Connectez-vous pour voter avec ce QR code.'
    await router.replace({
      path: '/',
      query: { authMessage: message }
    })
    return
  }

  status.value = 'pending'
  detail.value = ''

  try {
    const response = await fetch(`${backendUrl}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        choiceId,
        userToken: token
      })
    })

    const data = await response.json()

    if (!response.ok) {
      status.value = 'error'
      detail.value = data?.error || 'Impossible de voter.'
      return
    }

    status.value = 'success'
    detail.value = 'Merci ! Votre vote a bien été pris en compte.'
    window.localStorage.setItem('quizzy.voted', 'true')
  } catch (error) {
    status.value = 'error'
    detail.value = 'Erreur réseau lors du vote.'
  }
}

onMounted(() => {
  startVote()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48px 6vw;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at top, #1f1f3a, #0e0e14 60%);
  color: #f8f8ff;
}

.card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 32px;
  max-width: 520px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.25);
  display: grid;
  gap: 16px;
}

.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.4em;
  font-size: 12px;
  color: #7f7dff;
  margin: 0;
}

.status {
  font-weight: 600;
  font-size: 18px;
}

.status.pending {
  color: #c9c8ff;
}

.status.success {
  color: #7fffb3;
}

.status.error {
  color: #ff9fb8;
}

.detail {
  color: #b7b6ff;
}

.primary {
  background: linear-gradient(120deg, #7f7dff, #ff8fd8);
  color: #0e0e14;
  font-weight: 600;
  border: none;
  border-radius: 999px;
  padding: 10px 20px;
  text-decoration: none;
  justify-self: center;
}
</style>
