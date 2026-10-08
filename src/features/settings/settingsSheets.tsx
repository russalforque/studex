import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, Image as ImageIcon, Trash2 } from 'lucide-react'
import { useRepos, useSettings } from '@/app/contexts'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { CATEGORY_ICONS, CategoryIcon } from '@/components/ui/CategoryIcon'
import { ConfirmSheet } from '@/components/ui/ConfirmSheet'
import { Field, TextInput } from '@/components/ui/fields'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { DeleteAction, FormError, FormStack } from '@/features/shared/formParts'
import { MONEY } from '@/hooks/queryKeys'
import { useAction } from '@/hooks/useAction'
import { useForm } from '@/hooks/useForm'
import type { ExpenseCategory, Semester } from '@/types/models'
import { errorMessage } from '@/repositories/errors'
import { photoToAvatar } from '@/utils/image'
import { categorySchema, profileSchema, semesterSchema, validate, type ProfileInput } from '@/validation/schemas'

export function ProfileSheet({ onClose }: { onClose: () => void }) {
  const repos = useRepos()
  const settings = useSettings()
  const toast = useToast()
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const form = useForm({
    studentName: settings.studentName,
    schoolName: settings.schoolName ?? '',
    course: settings.course ?? '',
    yearLevel: settings.yearLevel ?? '',
  })
  const save = useAction((input: ProfileInput) => repos.settings.updateProfile(input), ['settings'], { success: 'Profile saved' })
  const setPhoto = useAction((photo: string | null) => repos.settings.setAvatar(photo), ['settings'], {
    success: 'Photo updated',
  })

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await setPhoto.run(await photoToAvatar(file))
    } catch (err) {
      toast(errorMessage(err), 'error')
    }
  }

  const onSubmit = async () => {
    const res = validate(profileSchema, form.values)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Profile" footer={<Button size="lg" block loading={save.pending} onClick={onSubmit}>Save</Button>}>
      <FormError message={form.formError} />
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={form.values.studentName || settings.studentName} photo={settings.avatar} size={72} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={setPhoto.pending} icon={<ImageIcon className="size-4" aria-hidden />} onClick={() => galleryRef.current?.click()}>
            {settings.avatar ? 'Change' : 'Add photo'}
          </Button>
          <IconButton label="Take a photo" onClick={() => cameraRef.current?.click()}>
            <Camera className="size-5" />
          </IconButton>
          {settings.avatar && (
            <IconButton label="Remove photo" onClick={() => setPhoto.fire(null)}>
              <Trash2 className="size-5" />
            </IconButton>
          )}
        </div>
        {/* Gallery and camera are separate inputs: `capture` opens the camera directly on both platforms. */}
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => void onPick(e)} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" hidden onChange={(e) => void onPick(e)} />
      </div>
      <FormStack>
        <Field label="Your name" error={form.errors.studentName}>
          {(id) => <TextInput id={id} autoComplete="name" value={form.values.studentName} invalid={!!form.errors.studentName} onChange={(e) => form.set('studentName', e.target.value)} />}
        </Field>
        <Field label="School or university" optional error={form.errors.schoolName}>
          {(id) => <TextInput id={id} value={form.values.schoolName} onChange={(e) => form.set('schoolName', e.target.value)} />}
        </Field>
        <Field label="Course or program" optional error={form.errors.course}>
          {(id) => <TextInput id={id} placeholder="e.g. BS Information Technology" value={form.values.course} onChange={(e) => form.set('course', e.target.value)} />}
        </Field>
        <Field label="Year level" optional error={form.errors.yearLevel}>
          {(id) => <TextInput id={id} placeholder="e.g. 2nd year" value={form.values.yearLevel} onChange={(e) => form.set('yearLevel', e.target.value)} />}
        </Field>
        <p className="text-footnote text-ink-3">Your photo stays on this device and is included in backups.</p>
      </FormStack>
    </Sheet>
  )
}

/** Edit the current term, or (with `startNew`) begin a new one. */
export function TermSheet({ semester, startNew, onClose }: { semester: Semester | null; startNew?: boolean; onClose: () => void }) {
  const repos = useRepos()
  const form = useForm({
    name: startNew ? '' : (semester?.name ?? ''),
    academicYear: startNew ? (semester?.academicYear ?? '') : (semester?.academicYear ?? ''),
  })
  const save = useAction(
    async (input: { name: string; academicYear: string | null }) => {
      if (startNew || !semester) await repos.settings.startSemester(input)
      else await repos.settings.updateSemester(semester.id, input)
    },
    ['settings', 'semesters', 'subjects', 'slots', 'grades', 'attendance'],
    { success: startNew ? 'New term started' : 'Term saved' },
  )
  const onSubmit = async () => {
    const res = validate(semesterSchema, form.values)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={startNew ? 'Start a new term' : 'Current term'}
      footer={<Button size="lg" block loading={save.pending} onClick={onSubmit}>{startNew ? 'Start term' : 'Save'}</Button>}
    >
      <FormError message={form.formError} />
      <FormStack>
        {startNew && (
          <p className="text-subhead text-ink-2">
            Your subjects and schedule start fresh for the new term. Earlier terms are kept, along with all tasks, exams and money records.
          </p>
        )}
        <Field label="Term" error={form.errors.name}>
          {(id) => (
            <TextInput id={id} autoFocus={startNew} placeholder="e.g. 2nd Semester" value={form.values.name} invalid={!!form.errors.name} onChange={(e) => form.set('name', e.target.value)} />
          )}
        </Field>
        <Field label="Academic year" optional>
          {(id) => <TextInput id={id} placeholder="2026–2027" value={form.values.academicYear} onChange={(e) => form.set('academicYear', e.target.value)} />}
        </Field>
      </FormStack>
    </Sheet>
  )
}

export function CategorySheet({ category, onClose }: { category?: ExpenseCategory | undefined; onClose: () => void }) {
  const repos = useRepos()
  const [confirming, setConfirming] = useState(false)
  const form = useForm({ name: category?.name ?? '', icon: category?.icon ?? 'other' })
  const save = useAction(
    async (input: { name: string; icon: string }) => {
      if (category) await repos.expenses.updateCategory(category.id, input)
      else await repos.expenses.createCategory(input)
    },
    ['categories', ...MONEY],
    { success: category ? 'Category saved' : 'Category added' },
  )
  const archive = useAction(() => repos.expenses.archiveCategory((category?.id ?? "")), ['categories'], { success: 'Category removed' })
  const onSubmit = async () => {
    const res = validate(categorySchema, form.values)
    if (!res.ok) return form.setErrors(res.errors)
    if (await form.submit(() => save.run(res.data))) onClose()
  }
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={category ? 'Edit category' : 'New category'}
        headerAction={category && !category.isDefault && <DeleteAction label="Remove category" onClick={() => setConfirming(true)} />}
        footer={<Button size="lg" block loading={save.pending} onClick={onSubmit}>Save</Button>}
      >
        <FormError message={form.formError} />
        <FormStack>
          <Field label="Name" error={form.errors.name}>
            {(id) => <TextInput id={id} autoFocus={!category} placeholder="e.g. Coffee" value={form.values.name} invalid={!!form.errors.name} onChange={(e) => form.set('name', e.target.value)} />}
          </Field>
          <Field label="Icon">
            {() => (
              <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-2">
                {Object.keys(CATEGORY_ICONS).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={form.values.icon === key}
                    aria-label={key}
                    onClick={() => form.set('icon', key)}
                    className="press flex justify-center"
                  >
                    <CategoryIcon icon={key} selected={form.values.icon === key} className="size-11" />
                  </button>
                ))}
              </div>
            )}
          </Field>
        </FormStack>
      </Sheet>
      <ConfirmSheet
        open={confirming}
        title="Remove this category?"
        message="It won't appear when adding expenses. Past expenses keep this category."
        confirmLabel="Remove"
        onConfirm={async () => {
          await archive.run()
          onClose()
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  )
}
