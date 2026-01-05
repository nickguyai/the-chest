import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, CreateSeasonInput } from '../lib/api'

export function useSeasons() {
  return useQuery({
    queryKey: ['seasons'],
    queryFn: () => api.getSeasons(),
  })
}

export function useActiveSeason() {
  return useQuery({
    queryKey: ['activeSeason'],
    queryFn: () => api.getActiveSeason(),
  })
}

export function useSeason(id: number) {
  return useQuery({
    queryKey: ['season', id],
    queryFn: () => api.getSeason(id),
    enabled: !!id,
  })
}

export function useCreateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateSeasonInput) => api.createSeason(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
    },
  })
}

export function useActivateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.activateSeason(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      queryClient.invalidateQueries({ queryKey: ['activeSeason'] })
      queryClient.invalidateQueries({ queryKey: ['season'] })
    },
  })
}

export function useDeactivateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.deactivateSeason(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      queryClient.invalidateQueries({ queryKey: ['activeSeason'] })
      queryClient.invalidateQueries({ queryKey: ['season'] })
    },
  })
}

export function useUpdateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateSeasonInput> }) =>
      api.updateSeason(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['season', id] })
      queryClient.invalidateQueries({ queryKey: ['seasons'] })
      queryClient.invalidateQueries({ queryKey: ['activeSeason'] })
    },
  })
}
