import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { SupabaseClient } from "@supabase/supabase-js";
import { FolderDto } from "./model/FolderDto";
import { ContainersService } from "../containers/containers.service";
import { CreateFolderDto } from "./model/CreateFolderDto";
import { v4 } from "uuid";
import { UpdateFolderDto } from "./model/UpdateFolderDto";
import { SupabaseService } from "../supabase/supabase.service";

@Injectable()
export class FoldersService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly containersService: ContainersService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async getUserFolderTree(userId: string) {
    try {
      const { data: treeData, error } = await this.supabase
        .from('user_folder_tree_view')
        .select('folders, root_containers')
        .eq('user_id', userId)
        .single();

      if (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // If no data found for user, return empty structure
      if (!treeData) {
        return {
          folders: [],
          root_containers: []
        };
      }

      return {
        folders: treeData.folders || [],
        root_containers: treeData.root_containers || []
      };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  public async getFolderById(userId: string, folderId: string) {
    return await this.verifyUserAccessAndGetFolder(userId, folderId);
  }

  public async deleteFolder(userId: string, folderId: string) {
    try {
      const folder = await this.verifyUserAccessAndGetFolder(userId, folderId);
      await this.containersService.deleteAllContainersInFolder(userId, folder.id);

      const { error: deleteError } = await this.supabase
        .from('folders')
        .delete()
        .eq('id', folder.id)
        .eq('user_id', userId);

      if (deleteError) {
        throw new HttpException(deleteError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return { message: 'Folder and related containers deleted successfully' };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async verifyUserAccessAndGetFolder(userId: string, folderId: string) {
    const container = await this.getFolderByIdInternal(folderId);
    if (container.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return container;
  }

  private async getFolderByIdInternal(folderId: string): Promise<FolderDto> {
    const { data: folders, error, status } =
      await this.supabase.from('folders')
        .select('*')
        .eq('id', folderId);
    if (error) {
      throw new HttpException(error.message, status);
    }
    if (!folders || folders.length === 0) {
      throw new HttpException('Folder not found', 404);
    }
    return folders[0];
  }

  public async createFolder(user_id: string, createFolderDto: CreateFolderDto) {
    const folderId = v4();
    const newFolder = {
      id: folderId,
      name: createFolderDto.name,
      user_id: user_id
    };

    const {
      error: folderError,
      status: folderStatus,
      data: createdFolders,
    } = await this.supabase.from('folders').insert([newFolder]).select();
    if (folderError) {
      throw new HttpException(folderError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    await this.containersService.addContainersToFolder(folderId, createFolderDto.container_ids);
    return createdFolders[0];
  }

  public async updateFolderName(userId: string, folderId: string, updateFolderDto: UpdateFolderDto) {
    const folder = await this.verifyUserAccessAndGetFolder(userId, folderId);

    const { error: updateError } = await this.supabase
      .from('folders')
      .update({
        name: updateFolderDto.name,
        updated_at: 'NOW()',
      })
      .eq('id', folder.id);

    if (updateError) {
      throw new HttpException(updateError.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return { success: true, message: 'Folder name updated successfully' };
  }
}
