import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, Index } from 'typeorm';
import { VideoResult } from './video-result.entity';

@Entity('video_jobs')
export class VideoJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'job_id', length: 50 })
  jobId: string;

  @Column({ name: 'product_name' })
  productName: string;

  @Column({ type: 'text' })
  script: string;

  @Column({ type: 'enum', enum: ['male', 'female'], name: 'voice_gender' })
  voiceGender: string;

  @Column({ name: 'prompt_count' })
  promptCount: number;

  @Column({ name: 'target_count' })
  targetCount: number;

  @Column({ type: 'json' })
  prompts: string[];

  @Column({ type: 'json', name: 'input_images' })
  inputImages: string[];

  @Column({ name: 'thumbnail_url', length: 500, nullable: true })
  thumbnailUrl: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => VideoResult, (result) => result.videoJob, { cascade: true })
  videos: VideoResult[];
}