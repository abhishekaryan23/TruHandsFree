import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'

let apiBasePromise: Promise<string> | null = null

async function resolveApiBase() {
  if (!apiBasePromise) {
    if (!window.windowControls?.getBackendBaseUrl) {
      apiBasePromise = Promise.reject(new Error('The local backend bridge is unavailable.'))
    } else {
      apiBasePromise = window.windowControls.getBackendBaseUrl().then((value) => {
        if (!value) {
          throw new Error('The local backend URL is not ready yet.')
        }
        return value
      })
    }
  }

  return apiBasePromise
}

async function request<T>(method: 'get' | 'post' | 'delete', path: string, config?: AxiosRequestConfig, data?: unknown) {
  const baseUrl = await resolveApiBase()
  const url = `${baseUrl}${path}`

  if (method === 'get') {
    return axios.get<T>(url, config)
  }

  if (method === 'delete') {
    return axios.delete<T>(url, config)
  }

  return axios.post<T>(url, data, config)
}

export function apiGet<T>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return request<T>('get', path, config)
}

export function apiPost<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return request<T>('post', path, config, data)
}

export function apiDelete<T>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  return request<T>('delete', path, config)
}

export async function getBackendBaseUrl() {
  return resolveApiBase()
}
