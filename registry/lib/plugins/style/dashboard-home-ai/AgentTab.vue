<template>
  <section class="dashboard-home-ai" aria-labelledby="dashboard-home-ai-title">
    <header class="dashboard-home-ai-header">
      <h2 id="dashboard-home-ai-title">
        <VIcon icon="mdi-robot-outline" :size="20" aria-hidden="true" />
        AI 助手
      </h2>
      <div v-if="providers.length" class="dashboard-home-ai-actions">
        <label for="dashboard-home-ai-provider">模型</label>
        <select
          id="dashboard-home-ai-provider"
          v-model="providerId"
          :disabled="Boolean(agentStatus)"
        >
          <option v-for="provider in providers" :key="provider.id" :value="provider.id">
            {{ provider.displayName }}
          </option>
        </select>
        <button
          type="button"
          class="dashboard-home-action"
          :disabled="!turns.length || Boolean(agentStatus)"
          @click="clearConversation"
        >
          清空对话
        </button>
      </div>
    </header>
    <p v-if="!providers.length" class="dashboard-home-ai-empty">
      请先在 Bilibili Evolved 的「AI 模型配置」中添加一个支持对话的模型。
    </p>
    <template v-else>
      <div
        ref="messageLog"
        class="dashboard-home-ai-log"
        role="log"
        aria-label="对话记录"
        tabindex="0"
      >
        <p v-if="!turns.length" class="dashboard-home-ai-empty">
          发送消息开始对话。消息可附带 B 站视频链接或 BV、AV 号。
        </p>
        <div v-for="(turn, index) in turns" :key="index" class="dashboard-home-ai-turn">
          <div class="dashboard-home-ai-message is-user">
            <strong>你</strong>
            <p>{{ turn.prompt }}</p>
          </div>
          <div v-if="turn.reply" class="dashboard-home-ai-message">
            <strong>助手</strong>
            <p>{{ turn.reply }}</p>
            <a v-if="turn.video" :href="turn.video.url" target="_blank" rel="noopener">
              {{ turn.video.title }}
            </a>
          </div>
        </div>
      </div>
      <p v-if="agentStatus" class="dashboard-home-ai-feedback" role="status">{{ agentStatus }}</p>
      <p v-if="agentError" class="dashboard-home-ai-feedback" role="alert">{{ agentError }}</p>
      <form class="dashboard-home-ai-form" @submit.prevent="send">
        <label for="dashboard-home-ai-message">消息</label>
        <textarea
          id="dashboard-home-ai-message"
          v-model="draft"
          :maxlength="messageLengthLimit"
          :readonly="Boolean(agentStatus)"
          rows="3"
          @keydown.enter="sendOnEnter"
        />
        <button type="submit" class="dashboard-home-action" :disabled="!canSend">
          <VIcon icon="mdi-send-outline" :size="16" aria-hidden="true" />
          发送
        </button>
      </form>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { getAIProviders } from '@/core/ai'
import { VIcon } from '@/ui'
import {
  agentError,
  agentStatus,
  askAgent,
  clearConversation,
  draft,
  messageLengthLimit,
  providerId,
  turns,
} from './agent'

const providers = computed(() =>
  getAIProviders().filter(({ id }) => !id.startsWith('Index-Translate-')),
)
const activeProvider = computed(() => providers.value.find(({ id }) => id === providerId.value))
const canSend = computed(() =>
  Boolean(activeProvider.value && draft.value.trim() && !agentStatus.value),
)
const messageLog = ref<HTMLElement>()

watch(
  providers,
  list => {
    if (!list.some(({ id }) => id === providerId.value)) {
      providerId.value = list[0]?.id ?? ''
    }
  },
  { immediate: true },
)

const scrollToLatest = async () => {
  await nextTick()
  const log = messageLog.value
  if (log) {
    log.scrollTop = log.scrollHeight
  }
}

const send = async () => {
  if (!canSend.value) {
    return
  }
  const reply = askAgent(activeProvider.value)
  await scrollToLatest()
  await reply
  await scrollToLatest()
}

const sendOnEnter = (event: KeyboardEvent) => {
  if (event.shiftKey || event.isComposing || event.keyCode === 229) {
    return
  }
  event.preventDefault()
  send()
}
</script>

<style lang="scss" src="./agent.scss"></style>
