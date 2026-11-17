'use client'

import { useState } from 'react'
import ConfirmDialog from '@/components/ConfirmDialog/ConfirmDialog'
import cancelJob from '@/actions/Jobs/cancelJob'
import cancelImport from '@/actions/Reading/cancelImport'
import { useJobs, type JobState } from '@/contexts/JobContext'
import { useUi } from '@/contexts/AuthContext'

export default function CancelButton({
  job,
  className,
  label = 'Отменить',
}: {
  job: JobState
  className?: string
  label?: string
}) {
  const { notify } = useUi()
  const { removeJob } = useJobs()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const chat = job.type === 'chat'

  async function stop() {
    setBusy(true)
    try {
      if (job.id.startsWith('local-')) {
        await cancelImport(job.textId)
      } else {
        await cancelJob(job.id, job.textId)
      }
      removeJob(job.id)
      setOpen(false)
      notify(chat ? 'Генерация отменена' : 'Загрузка отменена')
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Не удалось отменить задачу')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={className || 'btn ghost slim'} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ConfirmDialog
        open={open}
        title={chat ? 'Остановить генерацию?' : 'Остановить загрузку?'}
        confirmLabel="Остановить"
        cancelLabel="Продолжить"
        busyLabel="Останавливаю…"
        busy={busy}
        onClose={() => setOpen(false)}
        onConfirm={() => void stop()}
      >
        <p>{chat ? 'Текст не сохранится, прогресс пропадёт.' : 'Текст не сохранится, прогресс загрузки пропадёт.'}</p>
      </ConfirmDialog>
    </>
  )
}
