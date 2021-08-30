import axios from 'axios'

export default function notify(content: string) {
  if (process.env.WEBHOOK_URL) {
    try {
      axios.post(process.env.WEBHOOK_URL, { content })
    } catch (e) {
      console.error(`could not notify webhook: ${content}`)
    }
  } else {
    console.warn(content)
  }
}
