import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, CreateCardInput, UpdateCardInput } from '../lib/api'

// Theme queries
export function useThemes() {
  return useQuery({
    queryKey: ['themes'],
    queryFn: () => api.getThemes(),
  })
}

// Card queries
export function useCard(id: number) {
  return useQuery({
    queryKey: ['card', id],
    queryFn: () => api.getCard(id),
    enabled: !!id,
  })
}

export function useCardChildren(id: number, type?: string, status?: string) {
  return useQuery({
    queryKey: ['cardChildren', id, type, status],
    queryFn: () => api.getCardChildren(id, type, status),
    enabled: !!id,
  })
}

export function useCardHierarchy(id: number) {
  return useQuery({
    queryKey: ['cardHierarchy', id],
    queryFn: () => api.getCardHierarchy(id),
    enabled: !!id,
  })
}

export function useCardsByType(type: string) {
  return useQuery({
    queryKey: ['cards', type],
    queryFn: () => api.getCardsByType(type),
    enabled: !!type,
  })
}

// Global Vetoes (Don't-Do List)
export function useGlobalVetoes() {
  return useQuery({
    queryKey: ['globalVetoes'],
    queryFn: () => api.getGlobalVetoes(),
  })
}

// Backlog
export function useBacklog(themeId: number) {
  return useQuery({
    queryKey: ['backlog', themeId],
    queryFn: () => api.getBacklog(themeId),
    enabled: !!themeId,
  })
}

// Active Actions
export function useActiveActions() {
  return useQuery({
    queryKey: ['activeActions'],
    queryFn: () => api.getActiveActions(),
  })
}

// Theme Hours (Property 6: Time Aggregation)
export function useAllThemeHours(seasonId?: number) {
  return useQuery({
    queryKey: ['themeHours', seasonId],
    queryFn: () => api.getAllThemeHours(seasonId),
  })
}

export function useThemeHours(themeId: number, seasonId?: number) {
  return useQuery({
    queryKey: ['themeHours', themeId, seasonId],
    queryFn: () => api.getThemeHours(themeId, seasonId),
    enabled: !!themeId,
  })
}

// All Theme Conditions
export function useAllConditions() {
  return useQuery({
    queryKey: ['conditions'],
    queryFn: () => api.getAllConditions(),
  })
}

// Card mutations
export function useCreateCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateCardInput) => api.createCard(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      queryClient.invalidateQueries({ queryKey: ['activeActions'] })
      queryClient.invalidateQueries({ queryKey: ['globalVetoes'] })
      if (variables.parentId) {
        queryClient.invalidateQueries({ queryKey: ['cardChildren', variables.parentId] })
        queryClient.invalidateQueries({ queryKey: ['backlog', variables.parentId] })
      }
    },
  })
}

export function useUpdateCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCardInput }) =>
      api.updateCard(id, data),
    onSuccess: (result, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['card', id] })
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      queryClient.invalidateQueries({ queryKey: ['activeActions'] })
      if (result.parentId) {
        queryClient.invalidateQueries({ queryKey: ['cardChildren', result.parentId] })
        queryClient.invalidateQueries({ queryKey: ['backlog', result.parentId] })
      }
    },
  })
}

export function useDeleteCard() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => api.deleteCard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['cards'] })
      queryClient.invalidateQueries({ queryKey: ['activeActions'] })
      queryClient.invalidateQueries({ queryKey: ['globalVetoes'] })
      // Note: We can't invalidate specific wipStatus/backlog without knowing parentId
      // The component should handle this by passing parentId to the mutation
    },
  })
}

