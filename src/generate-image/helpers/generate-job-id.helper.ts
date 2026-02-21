export function generateJobId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(16).substring(2, 8); 
  return `IMG_JOB_${timestamp}_${random}`;
}