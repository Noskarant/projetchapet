export function smsHref(phone: string, message: string, appleDevice: boolean) {
  const recipient = phone.trim().replace(/[^+\d]/g, '').replace(/(?!^)\+/g, '');
  return `sms:${recipient}${appleDevice ? '&' : '?'}body=${encodeURIComponent(message)}`;
}

export function smsDocumentMessage(message: string, url: string) {
  return message.includes(url) ? message : `${message.trim()}\n\n${url}`;
}
