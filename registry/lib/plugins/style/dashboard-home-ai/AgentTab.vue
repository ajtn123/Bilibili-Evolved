<template>
  <section class="dashboard-home-ai" aria-label="AI 助手">
    <p v-if="!providers.length" class="dashboard-home-ai-empty">
      请先在 Bilibili Evolved 的「AI 模型配置」中添加一个支持对话的模型。
    </p>
    <template v-else>
      <div ref="messageLog" class="dashboard-home-ai-log" role="log" aria-label="对话记录">
        <p v-if="!turns.length" class="dashboard-home-ai-empty">
          发送消息开始对话。助手可以在你批准后使用 B 站接口。
        </p>
        <div v-for="(turn, index) in turns" :key="index" class="dashboard-home-ai-turn">
          <div class="dashboard-home-ai-message is-user">
            <strong>我</strong>
            <p>{{ turn.prompt }}</p>
          </div>
          <template v-for="(step, stepIndex) in turn.steps">
            <div
              v-if="step.status !== 'pending'"
              :key="stepIndex"
              class="dashboard-home-ai-message"
            >
              <strong
                >{{ requestLabels[step.status] }}{{ step.automatic ? ' · 自动批准' : '' }}</strong
              >
              <p>
                <code>{{ step.method }} {{ step.url }}</code>
              </p>
              <details v-if="step.result">
                <summary>
                  HTTP {{ step.result.status }}{{ step.result.truncated ? '（正文已截断）' : '' }}
                </summary>
                <pre v-if="step.result.body !== undefined">{{
                  formatResponseBody(step.result.body)
                }}</pre>
                <p v-else>响应正文为空。</p>
              </details>
            </div>
          </template>
          <div v-if="turn.reply" class="dashboard-home-ai-reply">
            <strong>{{ turn.modelName }}</strong>
            <div
              v-if="turn.replyHtml !== undefined"
              class="dashboard-home-ai-markdown"
              v-html="turn.replyHtml"
            />
            <p v-else class="dashboard-home-ai-plain">{{ turn.reply }}</p>
            <div
              v-if="turn.cards.length"
              class="dashboard-home-ai-cards"
              data-content-card-layout="horizontal"
              role="region"
              aria-label="回复中的卡片"
              tabindex="0"
            >
              <ul role="list">
                <li
                  v-for="(card, cardIndex) in turn.cards"
                  :key="cardIndex"
                  class="dashboard-home-card-grid-item"
                >
                  <ContentCard :data="card" />
                </li>
              </ul>
            </div>
          </div>
          <p v-if="turn.cancelled" class="dashboard-home-ai-feedback">已取消本轮对话。</p>
        </div>
      </div>
      <div ref="composer" class="dashboard-home-ai-composer">
        <p class="dashboard-home-ai-feedback" role="status">{{ agentStatus }}</p>
        <div v-if="pendingRequest" class="dashboard-home-ai-message">
          <p>
            <code>{{ pendingRequest.method }} {{ pendingRequest.url }}</code>
          </p>
          <p>请求会使用你的 B 站登录状态。批准后，响应内容（可能包含账号资料）会发送给所选模型。</p>
          <div class="dashboard-home-ai-actions">
            <button type="button" class="dashboard-home-action" @click="reviewRequest(true)">
              批准请求
            </button>
            <button type="button" class="dashboard-home-action" @click="reviewRequest(false)">
              拒绝请求
            </button>
          </div>
        </div>
        <p v-if="approvalMode !== 'manual' && !pendingRequest" class="dashboard-home-ai-feedback">
          自动批准的请求会使用你的 B 站登录状态，响应内容（可能包含账号资料）会发送给所选模型。
        </p>
        <p v-if="agentError" class="dashboard-home-ai-feedback" role="alert">{{ agentError }}</p>
        <form class="dashboard-home-ai-form" @submit.prevent="send">
          <label class="dashboard-home-visually-hidden" for="dashboard-home-ai-message">消息</label>
          <textarea
            id="dashboard-home-ai-message"
            ref="messageInput"
            v-model="draft"
            :readonly="Boolean(agentStatus)"
            placeholder="输入消息"
            rows="3"
            @keydown.enter="sendOnEnter"
          />
          <div class="dashboard-home-ai-actions">
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
            <label for="dashboard-home-ai-approval">请求审批</label>
            <select id="dashboard-home-ai-approval" v-model="approvalMode">
              <option value="manual">手动批准</option>
              <option value="get">自动批准 GET</option>
              <option value="all">自动批准全部</option>
            </select>
            <button
              type="button"
              class="dashboard-home-action"
              :disabled="!turns.length || Boolean(agentStatus)"
              @click="clearConversation"
            >
              清空对话
            </button>
            <button
              v-if="agentStatus"
              type="button"
              class="dashboard-home-action dashboard-home-ai-submit"
              @click="cancel"
            >
              取消本轮
            </button>
            <button
              v-else
              type="submit"
              class="dashboard-home-action dashboard-home-ai-submit"
              :disabled="!canSend"
            >
              <VIcon icon="mdi-send-outline" :size="16" aria-hidden="true" />
              发送
            </button>
          </div>
        </form>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { getAIProviders } from '@/core/ai'
import { VIcon } from '@/ui'
import ContentCard from '../../../components/style/home-redesign/dashboard/shared/cards/ContentCard.vue'
import type { ToolResult } from './bilibili-tools'
import {
  agentError,
  agentStatus,
  approvalMode,
  askAgent,
  cancelAgent,
  clearConversation,
  draft,
  pendingRequest,
  providerId,
  reviewRequest,
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
const composer = ref<HTMLElement>()
const messageInput = ref<HTMLTextAreaElement>()
const requestLabels = {
  running: '正在请求',
  rejected: '已拒绝请求',
  done: '接口响应',
  failed: '请求失败',
  cancelled: '已取消请求',
}

watch(
  providers,
  list => {
    if (!list.some(({ id }) => id === providerId.value)) {
      providerId.value = list[0]?.id ?? ''
    }
  },
  { immediate: true },
)

const formatResponseBody = (body: ToolResult['body']) =>
  typeof body === 'string' && body !== '' ? body : JSON.stringify(body, null, 2)

const scrollToLatest = async (force = false) => {
  const log = messageLog.value
  const footer = composer.value
  if (
    !log ||
    !footer ||
    (!force && log.getBoundingClientRect().bottom > footer.getBoundingClientRect().top)
  ) {
    return
  }
  await nextTick()
  if (log.isConnected) {
    const offset = log.getBoundingClientRect().bottom - footer.getBoundingClientRect().top
    if (offset > 0) {
      window.scrollBy({ top: offset, behavior: 'instant' })
    }
  }
}

watch(agentStatus, () => scrollToLatest())

onBeforeUnmount(() => {
  approvalMode.value = 'manual'
})

const send = () => {
  if (canSend.value) {
    askAgent(activeProvider.value)
    scrollToLatest(true)
  }
}

const cancel = async () => {
  cancelAgent()
  await nextTick()
  messageInput.value?.focus()
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
