import Button from './Button'

function FeedbackButton({ userEmail = '', userName = '' }) {
  function handleClick() {
    const subject = encodeURIComponent('Gardnr feedback')
    const body = encodeURIComponent([
      'Hi Gardnr team,',
      '',
      '',
      '',
      userName || userEmail ? 'Account context:' : '',
      userName ? `Name: ${userName}` : '',
      userEmail ? `Email: ${userEmail}` : '',
    ].filter(Boolean).join('\n'))

    window.location.href = `mailto:digigardenllc@gmail.com?subject=${subject}&body=${body}`
  }

  return (
    <Button onClick={handleClick} variant="muted" size="sm">
      Feedback
    </Button>
  )
}

export default FeedbackButton
