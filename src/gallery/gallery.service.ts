// src/gallery/gallery.service.ts

import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { VideoJob } from './entities/video-job.entity';
import { VideoResult } from './entities/video-result.entity';
import { CreateVideoJobDto } from './dto/create-video-job.dto';

@Injectable()
export class GalleryService {
  constructor(
    @InjectRepository(VideoJob)
    private videoJobRepository: Repository<VideoJob>,
    @InjectRepository(VideoResult)
    private videoResultRepository: Repository<VideoResult>,
    private dataSource: DataSource,
  ) {}

  async createJobMetadata(
    jobId: string,
    productName: string,
    script: string,
    voiceGender: string,
    promptCount: number,
    targetCount: number,
    prompts: string[],
    inputImages: string[],
    thumbnailUrl?: string,
  ): Promise<VideoJob> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const videoJob = queryRunner.manager.create(VideoJob, {
        jobId,
        productName,
        script,
        voiceGender,
        promptCount,
        targetCount,
        prompts,
        inputImages,
        thumbnailUrl: thumbnailUrl || 'https://via.placeholder.com/640x360.png?text=Processing',
        createdAt: new Date(),
      });

      const savedJob = await queryRunner.manager.save(videoJob);
      await queryRunner.commitTransaction();

      return savedJob;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      console.error('createJobMetadata error:', err);
      throw new InternalServerErrorException(`Failed to create job metadata: ${err.message}`);
    } finally {
      await queryRunner.release();
    }
  }

  async addVideosToJob(
    jobId: string,
    thumbnailUrl: string,
    videos: Array<{ variationNumber: number; videoUrl: string; fileName: string }>,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const job = await queryRunner.manager.findOne(VideoJob, { where: { jobId } });
      if (!job) {
        throw new NotFoundException('Job not found');
      }

      job.thumbnailUrl = thumbnailUrl;
      await queryRunner.manager.save(job);

      const videoResults = videos.map((v) =>
        queryRunner.manager.create(VideoResult, {
          ...v,
          videoJobId: job.id,
        }),
      );

      await queryRunner.manager.save(videoResults);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Failed to add videos to job');
    } finally {
      await queryRunner.release();
    }
  }

  async createJobWithVideos(dto: CreateVideoJobDto): Promise<VideoJob> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const videoJob = queryRunner.manager.create(VideoJob, {
        jobId: dto.jobId,
        productName: dto.productName,
        script: dto.script,
        voiceGender: dto.voiceGender,
        promptCount: dto.promptCount,
        targetCount: dto.targetCount,
        prompts: dto.prompts,
        inputImages: dto.inputImages,
        thumbnailUrl: dto.thumbnailUrl,
        createdAt: new Date(),
      });

      const savedJob = await queryRunner.manager.save(videoJob);

      const videoResults = dto.videos.map((v) =>
        queryRunner.manager.create(VideoResult, {
          ...v,
          videoJobId: savedJob.id,
        }),
      );

      await queryRunner.manager.save(videoResults);
      await queryRunner.commitTransaction();

      return savedJob;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Failed to save video gallery data');
    } finally {
      await queryRunner.release();
    }
  }

  async findAllJobs(page: number = 1, limit: number = 30) {
    const [jobs, total] = await this.videoJobRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      jobs: jobs.map(job => ({
        id: job.id,
        jobId: job.jobId,
        productName: job.productName,
        thumbnailUrl: job.thumbnailUrl,
        videoCount: job.targetCount,
        voiceGender: job.voiceGender,
        createdAt: job.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findJobDetail(jobId: string) {
    const job = await this.videoJobRepository.findOne({
      where: { jobId },
      relations: ['videos'],
    });

    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async deleteJob(jobId: string) {
    const job = await this.videoJobRepository.findOne({ where: { jobId } });
    if (!job) throw new NotFoundException('Job not found');

    // TODO: Implement S3 deletion here in Phase 2
    // await this.awsStorageService.deleteFolder(`results/${jobId}`);

    await this.videoJobRepository.remove(job);
    return { deletedJobId: jobId };
  }

  async deleteSingleVideo(videoId: string) {
    const video = await this.videoResultRepository.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');

    // TODO: Implement S3 deletion here in Phase 2
    // await this.awsStorageService.deleteFile(video.videoUrl);

    await this.videoResultRepository.remove(video);
    return { deletedVideoId: videoId };
  }
}
