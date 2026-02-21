import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { VideoJob } from './video-job.entity';

@Entity('video_results')
export class VideoResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'video_job_id' })
  videoJobId: string;

  @ManyToOne(() => VideoJob, (job) => job.videos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_job_id' })
  videoJob: VideoJob;

  @Column({ name: 'variation_number' })
  variationNumber: number;

  @Column({ name: 'video_url', length: 500 })
  videoUrl: string;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'is_scheduled', default: false })
  isScheduled: boolean;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}