import { Controller, Get, Patch, Param, Query, Req, UseInterceptors } from '@nestjs/common';
import { ResponseInterceptor } from 'src/common/interceptors/response.interceptor';
import { ResponseMessage } from 'src/common/decorators/response-message.decorator';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseInterceptors(ResponseInterceptor)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ResponseMessage('Notifications retrieved')
  async findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    return this.notificationsService.findAllByUser(
      req.user?.userId,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Get('unread-count')
  @ResponseMessage('Unread count retrieved')
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user?.userId);
    return { count };
  }

  @Patch(':id/read')
  @ResponseMessage('Notification marked as read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    await this.notificationsService.markAsRead(id, req.user?.userId);
  }

  @Patch('read-all')
  @ResponseMessage('All notifications marked as read')
  async markAllAsRead(@Req() req: any) {
    await this.notificationsService.markAllAsRead(req.user?.userId);
  }
}
