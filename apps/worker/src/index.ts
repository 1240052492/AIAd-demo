// ============================================================
// Legacy placeholder — DO NOT RUN.
// 真实 worker 在 apps/server/src/workers/image.worker.ts，作为 worker 容器运行。
//
// 此包已被“中性化”：它不再启动任何进程，避免与真实 BullMQ worker
// （image-generation / composition 队列）重复消费、互相抢队列。
// 若被误运行（例如 import 本包或执行其入口），会立即抛错退出，
// 并提示使用正确的 worker 容器入口。
// ============================================================

throw new Error(
  'Legacy placeholder — DO NOT RUN. ' +
    '真实 worker 在 apps/server/src/workers/image.worker.ts，作为 worker 容器运行。',
)
