import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5 min en cache
      staleTime: 1000 * 60 * 5,
      // no reintentar en errores 4xx
      retry: (failureCount, error) => {
        if (error instanceof Error && error.message.startsWith("Error 4")) {
          return false;
        }
        return failureCount < 2;
      },
    },
  },
});
