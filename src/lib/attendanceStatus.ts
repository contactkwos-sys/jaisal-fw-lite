export function computeAttendanceStatus(times: {
  in_time: string | null
  break_out: string | null
  break_in: string | null
  out_time: string | null
}): string {
  const { in_time, break_out, break_in, out_time } = times
  if (!in_time) return 'Absent'
  if (out_time) return 'Completed'
  if (break_out && !break_in) return 'On Break'
  return 'Present'
}
