import { useQuery } from '@tanstack/react-query'
import { fileUrl } from '@/services/fileStore'

/**
 * A loadable URL for a stored file. On phones it points straight at the file (the WebView
 * streams and caches it); in the browser build it's a cached object URL.
 */
export function useFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['fileurl', path],
    queryFn: () => fileUrl(path!),
    enabled: !!path,
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  })
}
