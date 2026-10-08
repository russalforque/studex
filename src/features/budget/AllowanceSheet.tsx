import { useState } from 'react'
import { useClock, useRepos, useSettings } from '@/app/contexts'
import { Button } from '@/components/ui/Button'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Loading } from '@/components/ui/display'
import { Sheet } from '@/components/ui/Sheet'
import { FormError, FormStack } from '@/features/shared/formParts'
import { useAllowancePlan } from '@/hooks/data'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { AllowancePlan } from '@/types/models'
import type { AllowancePlanInput } from '@/validation/schemas'
import { AllowanceFields } from './AllowanceFields'
import { initialAllowanceValues, toPlanInput } from './allowanceForm'

export function AllowanceSheet({ onClose }: { onClose: () => void }) {
  const { data: plan, isPending } = useAllowancePlan()
  if (isPending) {
    return (
      <Sheet open onClose={onClose} title="Allowance">
        <Loading />
      </Sheet>
    )
  }
  return <AllowanceForm plan={plan ?? null} onClose={onClose} />
}

function AllowanceForm({ plan, onClose }: { plan: AllowancePlan | null; onClose: () => void }) {
  const repos = useRepos()
  const { today } = useClock()
  const { currency } = useSettings()
  const [confirmStop, setConfirmStop] = useState(false)
  const form = useForm(() => initialAllowanceValues(today, plan))

  const save = useAction((input: AllowancePlanInput) => repos.allowance.savePlan(input, today), MONEY, {
    success: 'Allowance saved',
  })
  const stop = useAction(() => repos.allowance.stopPlan(), MONEY, { success: 'Allowance stopped' })

  const onSubmit = async () => {
    const res = toPlanInput(form.values, today)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={plan ? 'Edit allowance' : 'Set up allowance'}
        footer={
          <div className="flex flex-col gap-2">
            <Button size="lg" block loading={save.pending} onClick={onSubmit}>
              Save
            </Button>
            {plan && (
              <Button variant="ghost" block onClick={() => setConfirmStop(true)}>
                Stop allowance
              </Button>
            )}
          </div>
        }
      >
        <FormError message={form.formError} />
        <FormStack>
          <AllowanceFields values={form.values} set={form.set} errors={form.errors} currency={currency} autoFocus={!plan} />
          {plan && <p className="text-[13px] text-ink-3">Changes apply from the current period. Earlier periods stay as recorded.</p>}
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirmStop}
        title="Stop your allowance?"
        message="No new allowance will be added from now on. Everything already recorded stays, and you can set it up again anytime."
        confirmLabel="Stop allowance"
        onConfirm={async () => {
          await stop.run()
          onClose()
        }}
        onClose={() => setConfirmStop(false)}
      />
    </>
  )
}
