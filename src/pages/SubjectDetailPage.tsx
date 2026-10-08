import { useParams } from 'react-router'
import { Pencil } from 'lucide-react'
import { Page } from '@/components/layout/Page'
import { IconButton } from '@/components/ui/Button'
import { ErrorNotice, Loading } from '@/components/ui/display'
import { useSheets } from '@/features/sheets/SheetsContext'
import { SubjectDetail } from '@/features/subjects/SubjectDetail'
import { useSubject } from '@/hooks/data'

export function SubjectDetailPage() {
  const { id = '' } = useParams()
  const open = useSheets()
  const { data: subject, isPending, error } = useSubject(id)

  if (isPending) {
    return (
      <Page back>
        <Loading />
      </Page>
    )
  }
  if (error || !subject) {
    return (
      <Page back>
        <ErrorNotice message="This subject could not be found. It may have been deleted." />
      </Page>
    )
  }

  return (
    <Page
      back
      title="Subject"
      actions={
        <IconButton label="Edit subject" onClick={() => open({ type: 'subject', subject })}>
          <Pencil className="size-4.5" />
        </IconButton>
      }
    >
      <SubjectDetail subject={subject} />
    </Page>
  )
}
