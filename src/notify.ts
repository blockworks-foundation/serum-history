import axios from 'axios'

export default function notify(content: string) {
  if (process.env.WEBHOOK_URL) {
    axios.post(process.env.WEBHOOK_URL, { content })
  } else {
    console.warn(content)
  }
}
