// src/gallery/gallery.controller.ts

import { Controller, Get, Delete, Param, Query, UseInterceptors } from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';

@Controller('gallery')
@UseInterceptors(ResponseInterceptor)
export class GalleryController {
    constructor(private readonly galleryService: GalleryService) { }

    @Get('jobs')
    async getJobs(
        @Query('page') page: string,
        @Query('limit') limit: string,
    ) {
        return this.galleryService.findAllJobs(
            Number(page) || 1,
            Number(limit) || 30,
        );
    }

    @Get('jobs/:jobId')
    async getJobDetail(@Param('jobId') jobId: string) {
        return this.galleryService.findJobDetail(jobId);
    }

    @Delete('jobs/:jobId')
    @ResponseMessage('Job and all videos deleted')
    async deleteJob(@Param('jobId') jobId: string) {
        return this.galleryService.deleteJob(jobId);
    }

    @Delete('videos/:videoId')
    @ResponseMessage('Video deleted successfully')
    async deleteVideo(@Param('videoId') videoId: string) {
        return this.galleryService.deleteSingleVideo(videoId);
    }
}
