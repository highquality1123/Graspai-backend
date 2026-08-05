import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 } from 'uuid';

import { ContainerDto } from './model/ContainerDto';
import { CreateContainerDto } from './model/CreateContainerDto';
import { MoveContainerDto } from './model/MoveContainerDto';
import { RenameContainerDto } from './model/RenameContainerDto';

import { DocumentsService } from '../documents/documents.service';
import { DocumentTypeEnum } from '../documents/model/DocumentTypeEnum';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ContainersService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly documentService: DocumentsService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async getContainerById(userId: string, containerId: string) {
    const {
      data: containers,
      error,
      status,
    } = await this.supabase.from('containers').select('*').eq('id', containerId);
    const container = containers?.length > 0 ? containers[0] : null;
    if (container === null) {
      throw new HttpException('Not Found', HttpStatus.NOT_FOUND);
    }
    if (container.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }

    const documents = await this.documentService.getDocumentsByContainerId(containerId);
    const hasPdf = documents.some((doc) => doc.type === DocumentTypeEnum.PDF);
    const hasAudio = documents.some((doc) => doc.type === DocumentTypeEnum.AUDIO);
    const hasVideo = documents.some((doc) => doc.type === DocumentTypeEnum.VIDEO);

    return {
      ...container,
      documents: documents || [],
      has_pdf: hasPdf,
      has_audio: hasAudio,
      has_video: hasVideo,
    };
  }

  public async getContainersByUserId(userId: string) {
    try {
      const { data: containers, error: containersError } = await this.supabase
        .from('containers')
        .select('id, name, folder_id, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (containersError) {
        throw new HttpException(containersError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const containersWithFlags = await Promise.all(
        (containers || []).map(async (container) => {
          let documents = await this.documentService.getDocumentsByContainerId(container.id);
          documents = documents.map((doc) => ({
            id: doc.id,
            type: doc.type,
            name: doc.name,
            created_at: doc.created_at,
          }));
          const hasPdf = documents.some((doc) => doc.type === DocumentTypeEnum.PDF);
          const hasAudio = documents.some((doc) => doc.type === DocumentTypeEnum.AUDIO);
          const hasVideo = documents.some((doc) => doc.type === DocumentTypeEnum.VIDEO);

          return {
            ...container,
            has_pdf: hasPdf,
            has_audio: hasAudio,
            has_video: hasVideo,
            documents,
          };
        }),
      );

      return containersWithFlags;
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async deleteContainer(userId: string, containerId: string) {
    try {
      const container = await this.verifyUserAccessAndGetContainer(userId, containerId);
      await this.documentService.deleteAllDocumentsInContainer(userId, container.id);

      const { error: deleteError } = await this.supabase
        .from('containers')
        .delete()
        .eq('id', container.id)
        .eq('user_id', userId);

      if (deleteError) {
        throw new HttpException(deleteError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return { message: 'Container and Documents deleted' };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async verifyUserAccessAndGetContainer(userId: string, containerId: string) {
    const container = await this.getContainerByIdInternal(containerId);
    if (container.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return container;
  }

  private async getContainerByIdInternal(containerId: string): Promise<ContainerDto> {
    const {
      data: containers,
      error,
      status,
    } = await this.supabase.from('containers').select('*').eq('id', containerId);

    if (error) {
      throw new HttpException(error.message, status);
    }

    if (!containers || containers.length === 0) {
      throw new HttpException('Container not found', 404);
    }

    return containers[0];
  }

  public async deleteAllContainersInFolder(userId: string, folderId: string) {
    const { data: containers, error } = await this.supabase
      .from('containers')
      .select('id')
      .eq('user_id', userId)
      .eq('folder_id', folderId);

    if (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (!containers || containers.length === 0) {
      return { success: true, message: 'No containers found in the folder.' };
    }

    for (const container of containers) {
      try {
        await this.deleteContainer(userId, container.id);
      } catch (deleteError) {
        throw new HttpException(
          `Failed to delete container with ID ${container.id}: ${deleteError.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
    return { success: true, message: `${containers.length} containers deleted successfully.` };
  }

  public async addContainersToFolder(folderId: string, container_ids: string[]) {
    if (!container_ids || container_ids.length === 0) {
      return; // No containers to update
    }

    const { error, status } = await this.supabase
      .from('containers')
      .update({
        folder_id: folderId,
        updated_at: 'NOW()',
      })
      .in('id', container_ids); // Update containers where id is in container_ids

    if (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { success: true, updatedCount: status };
  }

  public async createContainer(userId: string, createContainerDto: CreateContainerDto) {
    try {
      const containerId = v4();
      const newContainer = {
        id: containerId,
        name: createContainerDto.name,
        user_id: userId,
      };

      const { data, error } = await this.supabase.from('containers').insert([newContainer]).select();

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return data?.[0];
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async moveContainer(userId: string, containerId: string, moveContainerDto: MoveContainerDto) {
    try {
      const container = await this.verifyUserAccessAndGetContainer(userId, containerId);

      const { error: updateError, data: updatedContainer } = await this.supabase
        .from('containers')
        .update({
          folder_id: moveContainerDto.folder_id,
          updated_at: 'NOW()',
        })
        .eq('id', container.id)
        .select();

      if (updateError) {
        throw new HttpException(updateError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return updatedContainer?.[0];
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async renameContainer(userId: string, containerId: string, renameContainerDto: RenameContainerDto) {
    try {
      const container = await this.verifyUserAccessAndGetContainer(userId, containerId);
      const { error: updateError, data: updatedContainer } = await this.supabase
        .from('containers')
        .update({
          name: renameContainerDto.name,
          updated_at: 'NOW()',
        })
        .eq('id', container.id)
        .select();

      if (updateError) {
        throw new HttpException(updateError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return updatedContainer?.[0];
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
